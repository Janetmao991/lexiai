
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch, query } from 'firebase/firestore';
import { WordEntry } from './types.ts';

const firebaseConfig = {
  apiKey: "AIzaSyB5vmmVQzwejgCg7LWE7O_WTU2sJQ6JxIs",
  authDomain: "ai-dictionary-10369.firebaseapp.com",
  projectId: "ai-dictionary-10369",
  storageBucket: "ai-dictionary-10369.firebasestorage.app",
  messagingSenderId: "793899132106",
  appId: "1:793899132106:web:faa1d2a2dce1234406c033",
  measurementId: "G-JK8RJLXBRF"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const firebaseService = {
  getWords: async (userId: string): Promise<Record<string, WordEntry>> => {
    try {
      const q = query(collection(db, 'users', userId, 'words'));
      const snapshot = await getDocs(q);
      const data: Record<string, WordEntry> = {};
      snapshot.forEach(doc => {
        data[doc.id] = doc.data() as WordEntry;
      });
      return data;
    } catch (e) {
      console.error("Firebase getWords failed:", e);
      return {};
    }
  },

  saveWord: async (userId: string, word: string, data: WordEntry) => {
    const wordRef = doc(db, 'users', userId, 'words', word);
    await setDoc(wordRef, { ...data, syncStatus: 'synced' });
  },

  deleteWord: async (userId: string, word: string) => {
    const wordRef = doc(db, 'users', userId, 'words', word);
    await deleteDoc(wordRef);
  },

  saveAllWords: async (userId: string, data: Record<string, WordEntry>) => {
    const batch = writeBatch(db);
    Object.entries(data).forEach(([word, entry]) => {
      const wordRef = doc(db, 'users', userId, 'words', word);
      batch.set(wordRef, { ...entry, syncStatus: 'synced' });
    });
    await batch.commit();
  }
};
