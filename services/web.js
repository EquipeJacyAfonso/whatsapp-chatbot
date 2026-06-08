/**
 * Serviço de Pesquisa na Web em Tempo Real (Google Search)
 */
const google = require('googlethis');

async function pesquisarWeb(query) {
  try {
    const options = {
      page: 0, 
      safe: false, // Desativa o safe search para não bloquear notícias sensíveis politicamente
      additional_params: { 
        hl: 'pt-BR' // Força os resultados em Português
      }
    };
    
    const response = await google.search(query, options);
    
    if (!response.results || response.results.length === 0) {
      return `Aviso para a IA: Nenhum resultado encontrado na web para "${query}".`;
    }

    let texto = `Resultados da pesquisa no Google para "${query}":\n\n`;
    
    // 1. Tenta pegar o Resumo do Google (Painel de Conhecimento) se existir
    if (response.knowledge_panel && response.knowledge_panel.description) {
       texto += `📌 Resumo Principal:\n${response.knowledge_panel.description}\n\n`;
    }

    // 2. Tenta pegar Notícias em Destaque (Muito útil para fact-checking político)
    if (response.top_news && response.top_news.length > 0) {
        texto += `📰 Principais Notícias Recentes:\n`;
        const limiteNews = Math.min(3, response.top_news.length);
        for(let i=0; i < limiteNews; i++) {
            const news = response.top_news[i];
            texto += `- ${news.title} (Fonte: ${news.source})\n`;
        }
        texto += `\n`;
    }

    // 3. Pega os 5 primeiros resultados orgânicos da web
    texto += `🌐 Resultados Gerais:\n`;
    const limiteResultados = Math.min(5, response.results.length);
    for(let i=0; i < limiteResultados; i++) {
       const res = response.results[i];
       texto += `🔹 Título: ${res.title}\n`;
       texto += `   Resumo: ${res.description}\n`;
       texto += `   Link: ${res.url}\n\n`;
    }

    return texto;
  } catch (error) {
    console.error("Erro na pesquisa web:", error.message);
    return `Aviso para a IA: Falha ao buscar na web. Erro: ${error.message}`;
  }
}

module.exports = { pesquisarWeb };