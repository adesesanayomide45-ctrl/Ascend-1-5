import { Platform } from 'react-native';
import { initializeApp, getApps, getApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let authInstance;
if (Platform.OS === 'web') {
  authInstance = FirebaseAuth.getAuth(app);
} else {
  try {
    authInstance = FirebaseAuth.initializeAuth(app, {
      persistence: FirebaseAuth.getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    // Already initialised (e.g. after a fast refresh)
    authInstance = FirebaseAuth.getAuth(app);
  }
}

export const auth = authInstance;
export const db = getFirestore(app);
export const storage = getStorage(app);
