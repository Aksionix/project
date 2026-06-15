import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "../firebase-config.js";

function getCurrentUser() {
    return auth.currentUser;
}

function observeAuthState(callback) {
    return onAuthStateChanged(auth, callback);
}

function waitForAuthReady() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
}

async function registerWithEmail(email, password) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
}

async function loginWithEmail(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
}

async function logoutUser() {
    await signOut(auth);
}

export {
    getCurrentUser,
    loginWithEmail,
    logoutUser,
    observeAuthState,
    registerWithEmail,
    waitForAuthReady
};