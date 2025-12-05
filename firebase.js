// firebase.js
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged,
    createUserWithEmailAndPassword, // New
    signInWithEmailAndPassword,     // New
    signOut,                        // New
    linkWithCredential,             // Important for preserving progression
    EmailAuthProvider               // Needed for the credential
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const firebaseConfig = {
    apiKey: window.env.VITE_API_KEY,
    authDomain: window.env.VITE_AUTH_DOMAIN,
    projectId: window.env.VITE_PROJECT_ID,
    storageBucket: window.env.VITE_STORAGE_BUCKET,
    messagingSenderId: window.env.VITE_MESSAGING_SENDER_ID,
    appId: window.env.VITE_APP_ID
};

let app, auth, db;

function initFirebase(onUserReady) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, (user) => {
        if (user) {
            onUserReady(user);
        } else {
            signInAnonymously(auth).catch(console.error);
        }
    });

    return { app, auth, db };
}
// 1. Function to convert an anonymous account to an email account (BEST OPTION FOR GAMES)
async function linkAnonymousAccountToEmail(email, password) {
    const credential = EmailAuthProvider.credential(email, password);
    try {
        const userCredential = await linkWithCredential(auth.currentUser, credential);
        console.log("Account linked!", userCredential.user);
        return userCredential.user;
    } catch (error) {
        console.error("Linking failed", error);
        throw error;
    }
}

// 2. Standard login (if they already have an account)
async function loginWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        console.error("Login failed", error);
        throw error;
    }
}

// 3. Logout
async function logout() {
    try {
        await signOut(auth);
        console.log("Logged out");
        // Optional: reload the page or sign in anonymously again
        window.location.reload(); 
    } catch (error) {
        console.error("Logout failed", error);
    }
}

// Don't forget to export
export { initFirebase, auth, db, linkAnonymousAccountToEmail, loginWithEmail, logout };
