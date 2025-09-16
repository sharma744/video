const socket = io();
const adduser = document.getElementById("adduser");
const inp = document.getElementById("inp");
const client = document.getElementById("client");
let localstreams;
let naam = "";
let peerconn;
let remote = false;
let targetUser = null;
const pendingCandidates = []; // Queue ICE candidates

// Create WebRTC connection
const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    // Add local stream
    if (localstreams) {
        localstreams.getTracks().forEach(track => {
            pc.addTrack(track, localstreams);
        });
    }

    // Receive remote stream
    pc.ontrack = (event) => {
        console.log("✅ Received remote track");
        client.srcObject = event.streams[0];
    };

    // Send ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("icecandidate", {
                to: targetUser,
                candidate: event.candidate
            });
        }
    };

    return pc;
};

// Get user media
async function videoon() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("you").srcObject = stream;
    localstreams = stream;
}
videoon();

// Join chat
adduser.addEventListener("click", () => {
    naam = inp.value.trim();
    if (!naam) return alert("Enter your name");
    socket.emit("chatconnect", naam);
});

// Update user list
socket.on("chatconnect", (allusers) => {
    const list = document.getElementById("userlist");
    list.innerHTML = "";

    for (const user in allusers) {
        if (user !== naam) {
            const li = document.createElement("li");
            li.textContent = user;

            const button = document.createElement("button");
            button.textContent = "Call";
            button.addEventListener("click", async () => {
                targetUser = user;
                peerconn = createPeerConnection();

                const offer = await peerconn.createOffer();
                await peerconn.setLocalDescription(offer);

                socket.emit("offer", {
                    from: naam,
                    to: user,
                    offer: peerconn.localDescription
                });
            });

            li.appendChild(button);
            list.appendChild(li);
        }
    }
});

// Handle receiving offer
socket.on("offer", async ({ from, offer }) => {
    targetUser = from;
    peerconn = createPeerConnection();
    remote = true;

    await peerconn.setRemoteDescription(offer);

    // Apply queued ICE candidates
    for (const candidate of pendingCandidates) {
        try {
            await peerconn.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("✅ Applied queued ICE candidate");
        } catch (err) {
            console.error("❌ Error adding queued ICE candidate", err);
        }
    }
    pendingCandidates.length = 0;

    const answer = await peerconn.createAnswer();
    await peerconn.setLocalDescription(answer);

    socket.emit("answer", {
        from: naam,
        to: from,
        answer: peerconn.localDescription
    });
});

// Handle receiving answer
socket.on("answer", async ({ answer }) => {
    if (peerconn.signalingState === "have-local-offer") {
        await peerconn.setRemoteDescription(answer);

        // Apply queued ICE candidates after setting remote description
        for (const candidate of pendingCandidates) {
            try {
                await peerconn.addIceCandidate(new RTCIceCandidate(candidate));
                console.log("✅ Applied queued ICE candidate (answer)");
            } catch (err) {
                console.error("❌ Error adding queued ICE candidate (answer)", err);
            }
        }
        pendingCandidates.length = 0;
    } else {
        console.warn("Unexpected signaling state:", peerconn.signalingState);
    }
});

// Handle receiving ICE candidate
socket.on("icecandidate", async ({ candidate }) => {
    if (!candidate || !candidate.candidate) return;

    if (peerconn) {
        if (peerconn.remoteDescription && peerconn.remoteDescription.type) {
            try {
                await peerconn.addIceCandidate(new RTCIceCandidate(candidate));
                console.log("✅ Added ICE candidate:", candidate);
            } catch (err) {
                console.error("❌ Error adding ICE candidate", err);
            }
        } else {
            console.log("⏳ Remote description not set. Queuing ICE candidate.");
            pendingCandidates.push(candidate);
        }
    } else {
        console.warn("⚠️ Peer connection not initialized. Dropping ICE candidate.");
    }
});
