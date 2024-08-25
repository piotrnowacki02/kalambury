let isPainting = false;
let lineWidth = 5;
let strokeStyle = "#cad3f4";

const ctx = canvas.getContext("2d");
let outgoing_buffer = [];
const START_OF_BUFFER = 0;
let isDrawer = false;
let canvasDatas = ['', '', '', '', ''];


function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  
  return JSON.parse(jsonPayload);
}

function getCookieValue(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
      return parts.pop().split(';').shift();
  }
  return null;
}

const socket = io("ws://localhost:8080");
socket.on("message", (incoming_buffer) => {
  if ("color" in incoming_buffer) {
    strokeStyle = incoming_buffer.color;
    strokeColorInput.value = strokeStyle;
    return;
  }
  if ("lineWidth" in incoming_buffer) {
    lineWidth = incoming_buffer.lineWidth;
    lineWidthInput.value = lineWidth;
    return;
  }
  if ("clearCanvas" in incoming_buffer) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  if("undo" in incoming_buffer) {
    canvasDatas.pop();
    const canvasDataUrl = canvasDatas[canvasDatas.length - 1];
    const img = new Image();
    img.src = canvasDataUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    return;
  }
  if ("canvasDataUrl" in incoming_buffer) {
    if (canvasDatas.length >= 5) {
      canvasDatas.shift();
    }
    canvasDatas.push(incoming_buffer.canvasDataUrl);
    return;
  }

  console.log("incoming_buffer", incoming_buffer.length);
  for (const msg of incoming_buffer) {
    if (msg === START_OF_BUFFER) {
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.strokeStyle = strokeStyle;
      ctx.fillStyle = strokeStyle;
      ctx.beginPath();
      ctx.arc(msg["x"], msg["y"], lineWidth * 0.01, 0, 2*Math.PI)
      ctx.stroke();
      ctx.moveTo(msg["x"], msg["y"]);
    } else {
      const ctx = canvas.getContext("2d");
      ctx.lineTo(msg["x"], msg["y"]);
      ctx.stroke();
    }
  }
});

let countdownInterval;
const timerDisplay = document.getElementById("timer");

function startTimer(duration) {
    let timeRemaining = duration;
    
    // Clear any existing interval
    clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;

        // Update the timer display in "MM:SS" format
        timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        // If time runs out, stop the timer
        if (timeRemaining <= 0) {
            clearInterval(countdownInterval);
            timerDisplay.textContent = "00:00";
        }

        timeRemaining--;
    }, 1000);
}

socket.on("new-round", (data) => {
  console.log("new-round", data);

  const roundDuration = data.roundDuration || 60; // w przyszłości ustaw żeby serwer przesyłał czas rundy
  startTimer(roundDuration);

  const template = `
      <div class="team">
          <h3>Team 1</h3>
          <ul>
              {{#team1}}
              <li class="{{#isDrawing}}highlight{{/isDrawing}}">{{name}}</li>
              {{/team1}}
          </ul>
      </div>
      <div class="team">
          <h3>Team 2</h3>
          <ul>
              {{#team2}}
              <li class="{{#isDrawing}}highlight{{/isDrawing}}">{{name}}</li>
              {{/team2}}
          </ul>
      </div>
  `;

  const rendered = Mustache.render(template, data);
  document.getElementById('team-list').innerHTML = rendered;

  const token = getCookieValue('playerId');
  if (!token) {
    console.error('Ciasteczko playerId nie istnieje');
    return; // Przerwij dalsze wykonanie, jeśli ciasteczko nie istnieje
  }

  const myPlayerId = parseJwt(token);

  isDrawer = (myPlayerId.value == data.currPlayerId[0].currPlayer_id);
});



socket.on('canvas-state-request', () => {
    console.log('Sending canvas state to server');
    if (isDrawer) {
        // Convert the canvas to a data URL
        const canvasDataUrl = canvas.toDataURL();
        socket.emit('canvas-state-update', canvasDataUrl);
    }
});


// Example function that sets the client as the drawer
function setAsDrawer(isDrawing) {
    isDrawer = isDrawing;
}

canvas.width = 500;
canvas.height = 400;

const canvasOffsetX = canvas.offsetLeft;
const canvasOffsetY = canvas.offsetTop;


const startDrawing = (e) => {
  const rect = canvas.getBoundingClientRect();
  if (e.button === 0) {
    // Sprawdź, czy to lewy przycisk myszy
    isPainting = true;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.strokeStyle = strokeStyle;
    ctx.fillStyle = strokeStyle;
    ctx.beginPath();
    ctx.arc(e.clientX - rect.left, e.clientY - rect.top, lineWidth * 0.01, 0, 2*Math.PI)
    ctx.stroke();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    outgoing_buffer.push(START_OF_BUFFER);
    outgoing_buffer.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }
};

const draw = (e) => {
  if (!isPainting) return;
  const rect = canvas.getBoundingClientRect();
  ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
  ctx.stroke();
  outgoing_buffer.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
};

const sendBuffer = () => {
  console.log("outgoing buffer", outgoing_buffer.length);
  socket.emit("message", outgoing_buffer);
  outgoing_buffer = [];
};

const timer = setInterval(() => {
  if (isPainting) sendBuffer();
}, 1000 / 20);

const stopDrawing = (e) => {
  if (isPainting && e.button === 0) {
    // Dodano warunek sprawdzający czy isPainting jest true
    isPainting = false;
    sendBuffer();
    if (canvasDatas.length >= 5) {
      canvasDatas.shift();
    }
    canvasDatas.push(canvas.toDataURL());
    socket.emit("message", { canvasDataUrl: canvas.toDataURL() });
  }
};

canvas.addEventListener("mousedown", startDrawing);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDrawing);
canvas.addEventListener("mouseleave", stopDrawing);
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault(); // Zablokuj domyślne menu kontekstowe
});

undoButton.addEventListener("click", () => {
  console.log("undo, length: ", canvasDatas.length);
  if(canvasDatas.length <= 1) {
    return;
  }
  canvasDatas.pop();
  const canvasDataUrl = canvasDatas[canvasDatas.length - 1];
  const img = new Image();
  img.src = canvasDataUrl;
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  socket.emit("message", { undo: true });
});

clearButton.addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit("message", { clearCanvas: true });
});

lineWidthInput.addEventListener("change", (e) => {
  lineWidth = e.target.value;
  socket.emit("message", { lineWidth });
});

strokeColorInput.addEventListener("change", (e) => {
  strokeStyle = e.target.value;
  socket.emit("message", { color: strokeStyle });
});
