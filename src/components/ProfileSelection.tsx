import React, { useState, useEffect, useRef } from 'react';
import { Plus, ArrowLeft, Loader2, Settings, MoreHorizontal, Edit2, Trash2, Lock, AlertTriangle } from 'lucide-react';
import { getProfileStyle } from '../utils/profileStyle';

interface Profile {
  id: string;
  name: string;
  avatar?: string;
}

interface ProfileSelectionProps {
  onProfileSelected: (sessionToken: string, profile: Profile) => void;
}

export function ProfileSelection({ onProfileSelected }: ProfileSelectionProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadingProfileId, setLoadingProfileId] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    if (editingProfileId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingProfileId]);

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/profiles');
      const data = await res.json();
      setProfiles(data);
    } catch (err) {
      console.error("Failed to load profiles:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProfile = async (profileId: string, profile: Profile) => {
    try {
      setLoadingProfileId(profile.id);
      const res = await fetch("/api/profiles/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id }),
      });
      if (!res.ok) throw new Error("Login failed");
      const data = await res.json();
      if (data.token) {
        onProfileSelected(data.token, profile);
      }
    } catch (err) {
      console.error(err);
      setLoadingProfileId(null);
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProfileName })
      });
      const newProfile = await res.json();
      if (newProfile.id) {
        setProfiles([...profiles, newProfile]);
        setNewProfileName("");
        setIsAdding(false);
        // DO NOT REDIRECT AUTOMATICALLY
      }
    } catch (err) {
      console.error("Failed to create profile:", err);
    } finally {
      setCreating(false);
    }
  };

  const confirmDeleteProfile = async () => {
    if (!deleteConfirmId) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/profiles/${deleteConfirmId}`, { method: 'DELETE' });
      setProfiles(profiles.filter(p => p.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameSubmit = async (id: string) => {
    if (!editingName.trim()) {
      setEditingProfileId(null);
      return;
    }
    
    try {
      const res = await fetch(`/api/profiles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName })
      });
      if (res.ok) {
        setProfiles(profiles.map(p => p.id === id ? { ...p, name: editingName } : p));
      }
    } catch (err) {
      console.error("Rename failed:", err);
    } finally {
      setEditingProfileId(null);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setMenuOpenId(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-app-bg z-50">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const profileToDelete = profiles.find(p => p.id === deleteConfirmId);

  return (
    <div className="fixed inset-0 flex flex-col bg-app-bg z-50 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center p-6 w-full">
        <div className="text-white font-semibold text-2xl tracking-tight select-none flex items-center">
          ChatBot
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 pb-20">
        {!isAdding ? (
          <div className="w-full max-w-5xl space-y-12 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center space-y-3">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white drop-shadow-sm">
                Who's Chatting?
              </h1>
              <p className="text-zinc-400 text-lg sm:text-xl">
                Select a profile to continue
              </p>
            </div>

            <div className="flex flex-wrap items-start justify-center gap-6 sm:gap-10">
              {profiles.map(profile => {
                const style = getProfileStyle(profile.id);
                return (
                  <div key={profile.id} className="group relative flex flex-col items-center gap-4 w-32 sm:w-40">
                    <div className="relative w-32 h-32 sm:w-40 sm:h-40">
                      <button
                        onClick={() => handleSelectProfile(profile.id, profile)}
                        disabled={loadingProfileId === profile.id}
                        className={`w-full h-full rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:ring-4 hover:ring-white/20 focus:outline-none focus:ring-4 focus:ring-white/40 overflow-hidden ${style.color} ${loadingProfileId === profile.id ? 'opacity-80 scale-95' : ''}`}
                      >
                        {loadingProfileId === profile.id ? (
                          <Loader2 className="w-12 h-12 text-white animate-spin drop-shadow-md" />
                        ) : (
                          <span className="text-5xl sm:text-6xl drop-shadow-md select-none leading-none opacity-90">{style.emoji}</span>
                        )}
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === profile.id ? null : profile.id);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/30 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/50"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>

                      {menuOpenId === profile.id && (
                        <div className="absolute top-10 right-2 w-32 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl py-1 z-10 animate-in fade-in zoom-in-95 duration-100">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingProfileId(profile.id);
                              setEditingName(profile.name);
                              setMenuOpenId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-2"
                          >
                            <Edit2 className="w-4 h-4" /> Edit
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(profile.id);
                              setMenuOpenId(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="w-full text-center flex flex-col items-center gap-1">
                      {editingProfileId === profile.id ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onBlur={() => handleRenameSubmit(profile.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameSubmit(profile.id);
                            if (e.key === 'Escape') setEditingProfileId(null);
                          }}
                          className="w-full bg-zinc-900 border border-primary text-white rounded px-2 py-1 text-center text-lg focus:outline-none"
                        />
                      ) : (
                        <span className="font-medium text-lg text-white truncate w-full px-2">
                          {profile.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-sm text-zinc-500 font-medium">
                        <Lock className="w-3 h-3" /> Private
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Add Profile Button */}
              <button
                onClick={() => setIsAdding(true)}
                className="group flex flex-col items-center gap-4 w-32 sm:w-40 focus:outline-none"
              >
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl flex items-center justify-center border-2 border-transparent bg-zinc-800/80 hover:bg-zinc-800 transition-all duration-300 ease-out hover:border-zinc-500 group-focus-visible:border-zinc-500 group-focus-visible:ring-4 group-focus-visible:ring-zinc-700">
                  <Plus className="w-14 h-14 text-zinc-500 group-hover:text-zinc-300 transition-colors" strokeWidth={2} />
                </div>
                <div className="w-full text-center flex flex-col items-center gap-1 mt-1">
                  <span className="font-medium text-lg text-zinc-400 group-hover:text-white transition-colors w-full px-2">
                    Add Profile
                  </span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-md space-y-8 animate-in slide-in-from-bottom-8 fade-in duration-500 bg-zinc-900/50 p-8 rounded-3xl border border-zinc-800 shadow-2xl">
            <button 
              onClick={() => { setIsAdding(false); setNewProfileName(""); }}
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group focus:outline-none"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="font-medium">Cancel</span>
            </button>
            
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-white">Add Profile</h1>
              <p className="text-zinc-400 text-sm">Create a new isolated space for chats and memory.</p>
            </div>

            <form onSubmit={handleCreateProfile} className="space-y-6">
              <div className="space-y-2">
                <input 
                  ref={inputRef}
                  type="text" 
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Profile Name"
                  className="w-full bg-black/50 border border-zinc-700 text-white rounded-xl px-4 py-4 text-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-zinc-600"
                  required
                  maxLength={24}
                />
              </div>
              <button 
                type="submit"
                disabled={creating || !newProfileName.trim()}
                className="w-full py-4 rounded-xl bg-white text-black font-bold text-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 flex justify-center items-center gap-2 focus:outline-none focus:ring-4 focus:ring-zinc-600"
              >
                {creating ? <Loader2 className="w-6 h-6 animate-spin" /> : "Continue"}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Footer Banner */}
      <div className="flex justify-center p-6 mt-auto">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 text-sm font-medium select-none">
          <Lock className="w-4 h-4" />
          All profiles are private and secure
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && profileToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-2">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-white">Delete Profile?</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Are you sure you want to delete <strong>{profileToDelete.name}</strong>? This will permanently remove all chat history and memory associated with this profile.
              </p>
            </div>
            <div className="flex bg-zinc-900/50 border-t border-zinc-800 p-4 gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-white font-medium hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProfile}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors flex justify-center items-center gap-2 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
