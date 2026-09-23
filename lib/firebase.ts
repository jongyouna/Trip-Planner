import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// buja-map-vercel과 같은 Firebase 프로젝트. 이 값들은 공개돼도 안전하다: 접근 제어는
// Firebase Authentication과 Firestore 보안 규칙(docs/firebase-setup.md)이 담당한다.
const firebaseConfig = {
  apiKey: "AIzaSyAfI9UjxW2GiZWNQrHvrRj0SmMSkNeONbA",
  authDomain: "buja-map-b52eb.firebaseapp.com",
  projectId: "buja-map-b52eb",
  storageBucket: "buja-map-b52eb.firebasestorage.app",
  messagingSenderId: "482597136779",
  appId: "1:482597136779:web:06f39e7998a1ece0c6a78e",
};

/** 정적 export 빌드(서버 prerender) 중에는 초기화하지 않도록, 브라우저에서 호출될 때만 만든다. */
export function getFirebase() {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return { auth: getAuth(app), db: getFirestore(app) };
}
