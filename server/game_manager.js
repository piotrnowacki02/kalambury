const db = require('./db');

async function startNewRound(roomId) {
    try {
        console.log(`Rozpoczynanie nowej rundy w pokoju ${roomId}`);

        // Pobranie graczy z pokoju
        const players = await db.getRoomPlayers(roomId);
        if (players.length < 2) {
            console.log(`Za mało graczy w pokoju ${roomId} do rozpoczęcia rundy.`);
            return;
        }

        // Pobranie informacji o pokoju
        const room = await db.getRoom(roomId);
        let currentRound = room.round + 1;
        let newDrawingPlayer = selectNextDrawingPlayer(players, room.currPlayerId);
        let newWord = await db.updateWordInRoom(roomId);

        // Ustawienie nowego rysującego gracza, słowa i rozpoczęcie nowej rundy
        const roundTimestamp = new Date();
        await db.updateRoomRoundData(roomId, newDrawingPlayer, currentRound, roundTimestamp);

        console.log(`Nowa runda ${currentRound} w pokoju ${roomId}, rysuje gracz ${newDrawingPlayer}`);
        return { round: currentRound, drawingPlayer: newDrawingPlayer, word: newWord, timestamp: roundTimestamp };
    } catch (error) {
        console.error(`Błąd podczas rozpoczynania nowej rundy w pokoju ${roomId}:`, error);
    }
}

function selectNextDrawingPlayer(players, currentDrawerId) {
    if (players.length === 0) return null;

    let nextIndex = 0;
    if (currentDrawerId) {
        let currentIndex = players.findIndex(player => player.player_id === currentDrawerId);
        nextIndex = (currentIndex + 1) % players.length;
    }

    return players[nextIndex].player_id;
}

async function checkGuess(roomId, playerId, guessedWord) {
    try {
        const room = await db.getRoom(roomId);
        const correctWord = await db.getCurrentWord(roomId);

        if (guessedWord.trim().toLowerCase() === correctWord.trim().toLowerCase()) {
            console.log(`Gracz ${playerId} odgadł poprawnie słowo: ${guessedWord}`);

            let teamNumber = await db.getPlayerTeam(playerId);
            await db.updateTeamScore(roomId, teamNumber, room[`team${teamNumber}Score`] + 1);

            // Rozpoczęcie nowej rundy po poprawnym odgadnięciu
            return startNewRound(roomId);
        } else {
            console.log(`Gracz ${playerId} nie odgadł: ${guessedWord}`);
            return false;
        }
    } catch (error) {
        console.error("Błąd podczas sprawdzania zgadywanego słowa:", error);
        return false;
    }
}

async function endGame(roomId) {
    try {
        console.log(`Kończenie gry w pokoju ${roomId}`);
        await db.updateRoomStatus(roomId, false);
    } catch (error) {
        console.error(`Błąd podczas kończenia gry w pokoju ${roomId}:`, error);
    }
}

module.exports = {
    startNewRound,
    checkGuess,
    endGame
};
