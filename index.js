const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const pino = require('pino');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

let qrGlobal = '';

app.get('/', async (req, res) => {
  if (qrGlobal) {
    try {
      const qrImage = await qrcode.toDataURL(qrGlobal);
      res.send(`
        <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
          <h2>Escanea este código QR para conectar WhatsApp de Tecnolandia.cl</h2>
          <img src="${qrImage}" alt="QR WhatsApp" style="width:300px; height:300px;"/>
          <p>Actualiza la página si el código expira.</p>
        </div>
      `);
    } catch (err) {
      res.send('Generando código QR, por favor recarga en unos segundos...');
    }
  } else {
    res.send('Bot de Tecnolandia.cl activo 24/7. El WhatsApp ya está vinculado o el QR se está generando.');
  }
});

app.listen(PORT, () => {
  console.log(`Servidor web corriendo en el puerto ${PORT}`);
});

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      qrGlobal = qr;
      console.log('--- NUEVO QR DISPONIBLE EN LA WEB ---');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexión cerrada. Reconectando...', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      qrGlobal = '';
      console.log('¡Conectado exitosamente a WhatsApp de Tecnolandia.cl! ✅');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const remoteJid = m.key.remoteJid;
    const messageContent = m.message.conversation || m.message.extendedTextMessage?.text;

    if (!messageContent) return;
    console.log(`Mensaje recibido de ${remoteJid}: ${messageContent}`);

    if (messageContent.toLowerCase().includes('hola') || messageContent.toLowerCase().includes('precio')) {
      await sock.sendMessage(remoteJid, { 
        text: '✨ *Tecnolandia.cl* - Hola, gracias por escribirnos. Todos nuestros equipos y reparaciones cuentan con 3 meses de garantía. ¿En qué modelo estás interesado?' 
      });
    }
  });
}

connectToWhatsApp();
