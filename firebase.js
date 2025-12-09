import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    linkWithCredential,
    EmailAuthProvider 
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: window.env.VITE_API_KEY,
    authDomain: window.env.VITE_AUTH_DOMAIN,
    projectId: window.env.VITE_PROJECT_ID,
    storageBucket: window.env.VITE_STORAGE_BUCKET,
    messagingSenderId: window.env.VITE_MESSAGING_SENDER_ID,
    appId: window.env.VITE_APP_ID
};

// Initialize immediately
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize Firebase and set up auth state listener
function initFirebase(onUserReady) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("🔥 Firebase auth state: User logged in", user.uid);
            onUserReady(user);
        } else {
            console.log("🔥 Firebase auth state: No user, signing in anonymously...");
            // Auto-login anonymously if no user is signed in
            signInAnonymously(auth)
                .then(() => console.log("✅ Anonymous sign-in successful"))
                .catch(err => console.error("❌ Anonymous sign-in failed:", err));
        }
    });

    return { app, auth, db };
}

// Link the current anonymous account to an email/password credential
async function linkAnonymousAccountToEmail(email, password) {
    const credential = EmailAuthProvider.credential(email, password);
    try {
        const userCredential = await linkWithCredential(auth.currentUser, credential);
        console.log("Account linked successfully:", userCredential.user);
        return userCredential.user;
    } catch (error) {
        console.error("Error linking account:", error);
        throw error;
    }
}

// Sign in with an existing email/password account
async function loginWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
}

// Sign out the current user
async function logout() {
    try {
        await signOut(auth);
        console.log("User signed out");
        window.location.reload(); 
    } catch (error) {
        console.error("Logout failed:", error);
    }
}

export { 
    initFirebase, 
    auth, 
    db, 
    linkAnonymousAccountToEmail, 
    loginWithEmail, 
    logout 
};