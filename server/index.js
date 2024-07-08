const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
var mustacheExpress = require('mustache-express');
const { createPool } = require('mysql2/promise');
const morgan = require('morgan');

let playerId = null;
let roomId = null;

const pool = createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'kalambury',
    connectionLimit: 10
});

const SECRET_KEY = 'I love you dude. Let it rip';

const app = express();

app.engine('moustache', mustacheExpress());

app.set('view engine', 'moustache');
app.set('views', path.join(__dirname, '..', 'client_vanilla'));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// TASK (middleware task)
// Find and add a library that lets u control the amount of incoming traffic so this lil motherfucker
// cant just do setInterval(() => createRoom.click(), 0); and fuck u up ;)

let roomIdisNull = async (playerId) => {
    try {
        const [results, _] = await pool.query('SELECT 1 FROM players p inner join rooms r on p.room_id = r.room_id WHERE player_id = ? AND p.room_id IS NOT NULL', [playerId]);
        return results.length === 0;
    } catch (error) {
        console.error('Błąd podczas sprawdzania playerName:', error);
        return true; // Domyślnie zakładaj, że name jest null, jeśli wystąpi błąd.
    }
};

let playerNameIsNull = async (playerId) => {
    try {
        const [results, _] = await pool.query('SELECT 1 FROM players WHERE player_id = ? AND name IS NOT NULL', [playerId]);
        return results.length === 0;
    } catch (error) {
        console.error('Błąd podczas sprawdzania playerName:', error);
        return true; // Domyślnie zakładaj, że name jest null, jeśli wystąpi błąd.
    }
};

const setPlayerId = async (res) => {
    const [results, _] = await pool.query('INSERT INTO players(name, team_id, room_id) VALUES (NULL, NULL, NULL)');
    console.log("inserted: ", results.insertId);
    playerId = results.insertId;
    const token = jwt.sign({ value: results.insertId }, SECRET_KEY, { expiresIn: '1h' });
    res.cookie('playerId', token, { httpOnly: true, secure: false });
};

app.use(async (req, res, next) => {
    console.log("GET/");
    if (!req.cookies.playerId) {
        await setPlayerId(res);
    } else {
        try {
            const decoded = jwt.verify(req.cookies.playerId, SECRET_KEY);
            console.log("decoded:", decoded.value);
            playerId = decoded.value;
        } catch (err) {
            await setPlayerId(res);
        }
    }

    // Zapobieganie przekierowaniu pętli: nie przekierowuj, jeśli już jesteśmy na /name lub /submit-name
    if (req.originalUrl == '/') {
        if (await playerNameIsNull(playerId)) {
            console.log("redirecting to /name");
            return res.redirect('/name');
        }
        if(await roomIdisNull(playerId))
        {
            console.log("redirecting to /roomSelect");
            return res.redirect('/roomSelect');
        }
    }



    next();
});

app.get('/name', (req, res) => {
    console.log("GET/name");
    res.sendFile(path.join(__dirname, '..', 'client_vanilla', 'name.html'));// kiedyś zrób to mustachem res.render('name');
});

app.post('/submit-name', async (req, res) => {
    const playerName = req.body.name;

    try {
        const [results, _] = await pool.query('UPDATE players SET name = ? WHERE player_id = ?', [playerName, playerId]);
        res.redirect('/');
    } catch (error) {
        console.error('Błąd podczas zapisu do bazy danych:', error);
        res.status(500).send('Wystąpił błąd podczas zapisu do bazy danych.');
    }
});

app.get('/roomSelect', (req, res) => {
    console.log("GET/roomSelect");
    res.sendFile(path.join(__dirname, '..', 'client_vanilla', 'roomSelect.html'));
});

app.get('/room-create', async (req, res) => {
    console.log("GET/room-create");
    try {
        console.log("room create sql start")
        const [results, _] = await pool.query('INSERT INTO rooms (room_id) VALUES (NULL);');
        roomId = results.insertId;
        console.log("room_id: ", roomId);
        const [results2, _2] = await pool.query('UPDATE players SET room_id = ? WHERE player_id = ?', [roomId, playerId]);
        res.sendFile(path.join(__dirname, '..', 'client_vanilla', 'room-create.html'));
    }
    catch (error) {
        console.error('Błąd podczas tworzenia pokoju:', error);
        res.status(500).send('Wystąpił błąd podczas tworzenia pokoju.');
    }
});

app.post('/room-join', async (req, res) => {
    console.log("POST/room-join", req.body['room-id']);
    // numer pokoju tu: req.body['room-id']
    try {
        console.log("room create sql start")
        const [results, _] = await pool.query('INSERT INTO rooms (room_id) VALUES (NULL);');
        roomId = results.insertId;
        console.log("room_id: ", roomId);
        const [results2, _2] = await pool.query('UPDATE players SET room_id = ? WHERE player_id = ?', [roomId, playerId]);
        // res.sendFile(path.join(__dirname, '..', 'client_vanilla', 'room-create.html'));
        res.redirect("/");
    }
    catch (error) {
        console.error('Błąd podczas tworzenia pokoju:', error);
        res.status(500).send('Wystąpił błąd podczas tworzenia pokoju.');
    }
});

app.use(express.static(path.join(__dirname, '..', 'client_vanilla')));

const server = http.createServer(app);

const io = require('socket.io')(server, {
    cors: { origin: '*' }
});

io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('message', (msg) => {
        socket.broadcast.emit('message', msg);
    });
});

server.listen(8080, () => { console.log('listening to http://localhost:8080'); });
