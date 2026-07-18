// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDMsIwIiY7zdWy5zKjFmxqmzaBJT7ePyHU",
  authDomain: "mirovoe-gospodstvo-91462.firebaseapp.com",
  databaseURL: "https://mirovoe-gospodstvo-91462-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mirovoe-gospodstvo-91462",
  storageBucket: "mirovoe-gospodstvo-91462.firebasestorage.app",
  messagingSenderId: "349228047052",
  appId: "1:349228047052:web:0808c79f73137856804069",
  measurementId: "G-V575BR72DK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
