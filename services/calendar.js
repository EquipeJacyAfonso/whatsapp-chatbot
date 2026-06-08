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
    
    // Usa o ID da agenda configurado no .env ou tenta a agenda principal da Service Account
    const calendarId = process.env.CALENDAR_ID || "primary";

    const res = await calendar.events.list({
      calendarId: calendarId,
      timeMin: new Date().toISOString(), // Pega apenas eventos de hoje para a frente
      maxResults: maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = res.data.items;
    if (!events || events.length === 0) {
      return `Nenhum evento futuro encontrado na agenda.`;
    }

    let responseText = `Próximos eventos encontrados na agenda:\n\n`;
    events.forEach((event) => {
      const start = event.start.dateTime || event.start.date;
      const end = event.end.dateTime || event.end.date;
      const dataInicio = new Date(start).toLocaleString('pt-BR');
      
      responseText += `📅 **${event.summary}**\n`;
      responseText += `   🕒 Início: ${dataInicio}\n`;
      if (event.location) responseText += `   📍 Local: ${event.location}\n`;
      if (event.description) responseText += `   📝 Detalhes: ${event.description}\n`;
      responseText += `\n`;
    });

    return responseText;
  } catch (error) {
    console.error("Erro no Google Calendar:", error.message);
    return `Aviso para a IA: Falha ao ler a agenda. Erro: ${error.message}`;
  }
}

module.exports = { getUpcomingEvents };