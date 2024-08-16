let isPainting = false;
let lineWidth = 5;
let strokeStyle = "#cad3f4";

const ctx = canvas.getContext("2d");
let outgoing_buffer = [];
const START_OF_BUFFER = 0;


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
            timerDisplay.style.color = "red";
            timerDisplay.style.fontWeight = "bold";
        }

        timeRemaining--;
    }, 1000);
}

socket.on("new-round", (data) => {
  console.log("new-round", data);

  const roundDuration = data.roundDuration || 58; // w przyszłości ustaw żeby serwer przesyłał czas rundy
  startTimer(roundDuration);

  // Szablon HTML dla listy drużyn
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

  // Generowanie nowej listy drużyn przy użyciu Mustache.js
  const rendered = Mustache.render(template, data);

  // Aktualizacja elementu DOM z listą drużyn
  document.getElementById('team-list').innerHTML = rendered;
});

canvas.width = 500;
canvas.height = 400;

const canvasOffsetX = canvas.offsetLeft;
const canvasOffsetY = canvas.offsetTop;


const startDrawing = (e) => {
  //console.log("offset: ", canvasOffsetX,"  ,  ", canvasOffsetY);
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
    // buffer.push(END_OF_BUFFER);
    sendBuffer();
  }
};

canvas.addEventListener("mousedown", startDrawing);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDrawing);
canvas.addEventListener("mouseleave", stopDrawing);
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault(); // Zablokuj domyślne menu kontekstowe
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
