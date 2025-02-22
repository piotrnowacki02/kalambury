const jwt = require('jsonwebtoken');
const SECRET_KEY = 'I love you dude. Let it rip';

function setPlayerCookie(res, playerId) {
    try {
        const token = jwt.sign({ value: playerId }, SECRET_KEY, { expiresIn: '1h' });
        res.cookie('playerId', token, { httpOnly: false, secure: false });
        console.log("Set player cookie for ID:", playerId);
    } catch (error) {
        console.error("Error setting player cookie:", error);
    }
}

function getPlayerIdFromCookies(req, res) {
    if (!req.cookies.playerId) {
        return null;
    }
    
    try {
        const decoded = jwt.verify(req.cookies.playerId, SECRET_KEY);
        console.log("Decoded player ID:", decoded.value);
        return decoded.value;
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            console.log("Token expired, generating new player ID");
            return null;
        }
        console.error("Invalid token");
        res.status(403).send('Invalid token');
        return null;
    }
}

module.exports = {
    setPlayerCookie,
    getPlayerIdFromCookies
};