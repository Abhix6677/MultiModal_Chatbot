import { extractValueFromContent } from './backendMemory';
const content = "SkyHost, TitanCloud, AlphaTest, AlphaTest2026, GammaTest, BetaTest, gemmatest, BetaTest";
console.log(extractValueFromContent(content, 'current_name'));
