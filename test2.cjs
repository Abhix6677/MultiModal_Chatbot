const cheerio = require('cheerio');
async function test() {
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent('aaj date kitna hai??');
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  let resultsText = '';
  $('.result').each((i, el) => {
    const title = $(el).find('.result__title').text().trim();
    const snippet = $(el).find('.result__snippet').text().trim();
    if (title && snippet) {
      resultsText += title + '\n' + snippet + '\n\n';
    }
  });
  console.log('RESULTS:', resultsText);
}
test();