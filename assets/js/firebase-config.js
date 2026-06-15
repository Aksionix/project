import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB5Vz5zr_jAY_hcGv_YcR8dk4UOAUAaIGI",
    authDomain: "superclothing-67408.firebaseapp.com",
    projectId: "superclothing-67408",
    storageBucket: "superclothing-67408.firebasestorage.app",
    messagingSenderId: "953538011444",
    appId: "1:953538011444:web:c0196929ba7429f9af8561",
    measurementId: "G-F26HENXF57"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
