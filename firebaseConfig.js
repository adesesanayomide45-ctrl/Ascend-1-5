import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBOMGkzWyn_pN7oMwCbErx1ICtgn_cVIF8",
  authDomain: "ascend-1-5.firebaseapp.com",
  projectId: "ascend-1-5",
  storageBucket: "ascend-1-5.firebasestorage.app",
  messagingSenderId: "425861570073",
  appId: "1:425861570073:web:ad1b5e3a19ad2ce25a1488"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
export const storage = getStorage(app);
