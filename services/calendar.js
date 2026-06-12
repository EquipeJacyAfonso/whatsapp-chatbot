/**
 * Serviço Google Calendar via Service Account
 */
const { google } = require("googleapis");

function getAuth() {
  const credsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!credsJson) return null;

  try {
    const creds = JSON.parse(credsJson);
    return new google.auth.GoogleAuth({
      credentials: creds,
      scopes: [
        "https://www.googleapis.com/auth/calendar.readonly"
      ],
    });
  } catch (e) {
    console.error("Erro ao ler credenciais do Google:", e.message);
    return null;
  }
}

async function getUpcomingEvents(maxResults = 10) {
  const auth = getAuth();
  if (!auth) return "Aviso para a IA: Credenciais do Google não configuradas.";

  try {
    const calendar = google.calendar({ version: "v3", auth });
    const calendarId = process.env.CALENDAR_ID || "primary";

    // MUDANÇA PROSVEITOSA: Define o início do dia de hoje (00:00:00) no horário local
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); 

    const res = await calendar.events.list({
      calendarId: calendarId,
      timeMin: hoje.toISOString(), // Busca tudo a partir do primeiro minuto do dia de hoje
      maxResults: maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = res.data.items;
    
    // Se a API responder com sucesso mas a lista vier vazia
    if (!events || events.length === 0) {
      return `Não encontrei nenhum compromisso ou evento agendado para os próximos dias na agenda (${calendarId}).`;
    }

    let responseText = `📅 **Próximos Compromissos da Agenda:**\n\n`;
    events.forEach((event) => {
      const start = event.start.dateTime || event.start.date;
      const dataInicio = new Date(start).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      
      responseText += `📌 **${event.summary}**\n`;
      responseText += `   🕒 Horário: ${dataInicio}\n`;
      if (event.location) responseText += `   📍 Local: ${event.location}\n`;
      if (event.description) responseText += `   📝 Notas: ${event.description}\n`;
      responseText += `\n`;
    });

    return responseText;
  } catch (error) {
    console.error("Erro no Google Calendar:", error.message);
    return `Aviso para a IA: Falha ao ler a agenda. Erro: ${error.message}`;
  }
}

module.exports = { getUpcomingEvents };