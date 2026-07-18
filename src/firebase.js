import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, get } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDMsIwIiY7zdWy5zKjFmxqmzaBJT7ePyHU",
  authDomain: "mirovoe-gospodstvo-91462.firebaseapp.com",
  databaseURL: "https://mirovoe-gospodstvo-91462-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "mirovoe-gospodstvo-91462",
  storageBucket: "mirovoe-gospodstvo-91462.firebasestorage.app",
  messagingSenderId: "349228047052",
  appId: "1:349228047052:web:0808c79f73137856804069",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export { ref, onValue, set, get };
