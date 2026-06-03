if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!\n");

      // NOVO: Busca todos os grupos e salva num JSON para a Interface
      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups).map((g) => ({
          id: g.id,
          name: g.subject,
        }));
        fs.writeFileSync(path.join(__dirname, "grupos.json"), JSON.stringify(groupList, null, 2));
      } catch (err) {
        console.error("Erro ao salvar lista de grupos:", err.message);
      }

      // Avisa o usuário no terminal
      if (!GROUP_ID) {
        console.log("ℹ️  GROUP_ID não configurado.");
        console.log("👉 Volte para a Interface no navegador (http://localhost:3000/config) e selecione o grupo!\n");
      } else {
        console.log(`✅ Monitorando grupo: ${GROUP_ID}\n`);
      }
    }