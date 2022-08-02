const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const mime = require('mime-types');
const { google } = require('googleapis');
const maintenaceMode = false;

const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

/**
 * BASED ON MANY QUESTIONS
 * Actually ready mentioned on the tutorials
 * 
 * Many people confused about the warning for file-upload
 * So, we just disabling the debug for simplicity.
 */
app.use(fileUpload({
  debug: false
}));

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ],
  },
  authStrategy: new LocalAuth()
});


// Google Spreadsheet start here
const privatekey = require("./privatekey.json");

const authClient = new google.auth.JWT(
  privatekey.client_email,
  null,
  privatekey.private_key,
  ['https://www.googleapis.com/auth/spreadsheets.readonly']);


// authentication
authClient.authorize()
  .then(function (tokens) {
      console.log("Google API authentication successful.\n");
  })
  .catch(function (error) {
      throw (error);
  });

const secrets = require("./secrets.json");

const rekapSampah = [];

const sheets = google.sheets('v4');

async function readSpreadsheet(spreadsheetID, sheetName) {
  try {
    var result = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetID,
        range: sheetName,
        auth: authClient
    });
        
    return result.data.values;
  } catch (err) {
    return [];
  }
}
// Google Spreadsheet end here

client.on('message', async msg => {
  if (maintenaceMode) {
    msg.reply("Maaf saat ini sedang dilakukan pemeliharaan sistem. Silakan kembali lagi nanti.");
  } else {
    const today = new Date();
    const contact = await msg.getContact();
    const phNumber = contact.number;

    const bodyMsg = (msg.body).toLowerCase().trim().replace(/\s\s+/g, " ");
    const bodyMsgSplit = bodyMsg.split(" ");

    let greeting = "Selamat datang bapak/ibu.";
    let message = "";

    readSpreadsheet(secrets.spreadsheet_id_informasi, "Pesan").then((response) => {
      if (response.length > 0) {
        const rows = response; 
        let matchKey = false;
        rows.forEach((element, index) => {  
          if (index > 0) {
            if (element[0] == "greeting") {
              greeting = element[1];
            }

            if (element[0] == bodyMsg) {
              message = element[1];
              matchKey = true;
            }
          }
        });

        if (!matchKey) {
          message = greeting;

          if (bodyMsgSplit.length > 1) {
            if (bodyMsgSplit[0] == "sampah") { // iuran sampah
              const sheet = bodyMsgSplit[1];        
              let  message = `Tidak ada data iuran sampah.`;
      
              if (sheet == "rekap") {
                msg.reply(message);
              } else {
                const tahun = sheet;
      
                readSpreadsheet(secrets.spreadsheet_id_sampah, sheet).then((response) => {
                  if (response.length > 0) {
                    const rows = response;
                    let  elementH = [];
                    let  elementD = [];
                    
                    rows.forEach((element,index) => {
                      if (index == 0) {
                        elementH = element; // ambil header sebagai label  
                      }
            
                      if (index > 0 && element[0] == phNumber) {
                        elementD = element; // ambil data sebagai value
            
                        if (elementD.length > 0) {
                          if (elementD.length > 3) {
                            message = "";
      
                            elementH.forEach((rowH, idH) => {
                              elementD.forEach((rowD, idD) => {
                                if (idH == idD) {                            
                                  message = message.concat(rowH).concat(" = ").concat(rowD).concat("\r\n");
                                }                
                              });
                            });
                          }
                        }                           
                      }          
                    });
            
                    msg.reply(message);
                  } else {                
                    msg.reply(message);
                  }          
                });
              }
            } else {
              readSpreadsheet(secrets.spreadsheet_id_informasi, "Pesan").then((response) => {
                if (response.length > 0) {
                  const rows = response;
                  rows.forEach((element, index) => {            
                    if (index > 0 && element[0] == "greeting") {
                      greeting = element[1];
                    }
                  });
      
                  message = greeting;
              
                  msg.reply(message);
                } else {
                  message = greeting;
              
                  msg.reply(message);
                }
              });
            }
          }
        } else {
          msg.reply(message);
        }
      } else {
        message = greeting;
    
        msg.reply(message);
      }
    });    

    // NOTE!
    // UNCOMMENT THE SCRIPT BELOW IF YOU WANT TO SAVE THE MESSAGE MEDIA FILES
    // Downloading media
    // if (msg.hasMedia) {
    //   msg.downloadMedia().then(media => {
    //     // To better understanding
    //     // Please look at the console what data we get
    //     console.log(media);

    //     if (media) {
    //       // The folder to store: change as you want!
    //       // Create if not exists
    //       const mediaPath = './downloaded-media/';

    //       if (!fs.existsSync(mediaPath)) {
    //         fs.mkdirSync(mediaPath);
    //       }

    //       // Get the file extension by mime-type
    //       const extension = mime.extension(media.mimetype);
          
    //       // Filename: change as you want! 
    //       // I will use the time for this example
    //       // Why not use media.filename? Because the value is not certain exists
    //       const filename = new Date().getTime();

    //       const fullFilename = mediaPath + filename + '.' + extension;

    //       // Save to file
    //       try {
    //         fs.writeFileSync(fullFilename, media.data, { encoding: 'base64' }); 
    //         console.log('File downloaded successfully!', fullFilename);
    //       } catch (err) {
    //         console.log('Failed to save the file:', err);
    //       }
    //     }
    //   });
    // }
  }  
});

client.initialize();

// Socket IO
io.on('connection', function(socket) {
  socket.emit('message', 'Connecting...');

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR Code received, scan please!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp is ready!');
    socket.emit('message', 'Whatsapp is ready!');
  });

  client.on('authenticated', () => {
    socket.emit('authenticated', 'Whatsapp is authenticated!');
    socket.emit('message', 'Whatsapp is authenticated!');
    console.log('AUTHENTICATED');
  });

  client.on('auth_failure', function(session) {
    socket.emit('message', 'Auth failure, restarting...');
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Whatsapp is disconnected!');
    client.destroy();
    client.initialize();
  });
});


const checkRegisteredNumber = async function(number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}

// Send message
app.post('/send-message', [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'The number is not registered'
    });
  }

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Send media
app.post('/send-media', async (req, res) => {
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  const fileUrl = req.body.file;

  // const media = MessageMedia.fromFilePath('./image-example.png');
  // const file = req.files.file;
  // const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
  let mimetype;
  const attachment = await axios.get(fileUrl, {
    responseType: 'arraybuffer'
  }).then(response => {
    mimetype = response.headers['content-type'];
    return response.data.toString('base64');
  });

  const media = new MessageMedia(mimetype, attachment, 'Media');

  client.sendMessage(number, media, {
    caption: caption
  }).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

const findGroupByName = async function(name) {
  const group = await client.getChats().then(chats => {
    return chats.find(chat => 
      chat.isGroup && chat.name.toLowerCase() == name.toLowerCase()
    );
  });
  return group;
}

// Send message to group
// You can use chatID or group name, yea!
app.post('/send-group-message', [
  body('id').custom((value, { req }) => {
    if (!value && !req.body.name) {
      throw new Error('Invalid value, you can use `id` or `name`');
    }
    return true;
  }),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  let chatId = req.body.id;
  const groupName = req.body.name;
  const message = req.body.message;

  // Find the group by name
  if (!chatId) {
    const group = await findGroupByName(groupName);
    if (!group) {
      return res.status(422).json({
        status: false,
        message: 'No group found with name: ' + groupName
      });
    }
    chatId = group.id._serialized;
  }

  client.sendMessage(chatId, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

// Clearing message on spesific chat
app.post('/clear-message', [
  body('number').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  const number = phoneNumberFormatter(req.body.number);

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'The number is not registered'
    });
  }

  const chat = await client.getChatById(number);
  
  chat.clearMessages().then(status => {
    res.status(200).json({
      status: true,
      response: status
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  })
});

server.listen(port, function() {
  console.log('App running on *: ' + port);
});
