const google = require('googlethis');

async function pesquisarWeb(query) {
  try {
    const options = {
      page: 0, 
      safe: false,
      additional_params: { 
        hl: 'pt-BR' 
      },
      // MUDANÇA: Adicionando um disfarce de navegador real para evitar bloqueios do Google
      axios_config: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    };
    
    const response = await google.search(query, options);
    
    if (!response.results || response.results.length === 0) {
      return `Aviso para a IA: Nenhum resultado encontrado na web para "${query}". Diga ao usuário que a busca não retornou dados relevantes hoje.`;
    }

    let texto = `Resultados da pesquisa para "${query}":\n\n`;
    
    if (response.top_news && response.top_news.length > 0) {
        texto += `📰 Principais Notícias:\n`;
        const limiteNews = Math.min(3, response.top_news.length);
        for(let i=0; i < limiteNews; i++) {
            texto += `- ${response.top_news[i].title} (${response.top_news[i].source})\n`;
        }
        texto += `\n`;
    }

    texto += `🌐 Resultados Gerais:\n`;
    const limiteResultados = Math.min(3, response.results.length); // Reduzido para poupar memória
    for(let i=0; i < limiteResultados; i++) {
       texto += `🔹 ${response.results[i].title}\n   ${response.results[i].description}\n\n`;
    }

    return texto;
  } catch (error) {
    console.error("Erro na pesquisa web:", error.message);
    return `Aviso para a IA: Falha ao buscar na web. Erro: ${error.message}`;
  }
}

module.exports = { pesquisarWeb };