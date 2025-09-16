import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
const io = new Server(server);

let allusers = {};

app.use(express.static("public"));
app.set("view engine", "ejs");

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("chatconnect", (username) => {
        allusers[username] = { name: username, id: socket.id };
        io.emit("chatconnect", allusers);
    });

    socket.on("offer", ({ from, to, offer }) => {
        console.log(`${from} is sending offer to ${to}`);
        if (allusers[to]) {
            io.to(allusers[to].id).emit("offer", { from, to, offer });
        }
    });

    socket.on("answer", ({ from, to, answer }) => {
        console.log(`${to} sent answer back to ${from}`);
        if (allusers[from]) {
            io.to(allusers[from].id).emit("answer", { from, to, answer });
        }
    });

    socket.on("icecandidate", ( candidate) => {
            socket.broadcast.emit("icecandidate", candidate);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        for (let user in allusers) {
            if (allusers[user].id === socket.id) {
                delete allusers[user];
                break;
            }
        }
        io.emit("chatconnect", allusers);
    });
});

app.get("/", (req, res) => {
    res.render("index");
});

server.listen(3000, "0.0.0.0", () => {
    console.log("✅ Server started on http://localhost:3000");
});
