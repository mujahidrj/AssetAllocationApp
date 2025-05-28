import { useState, useEffect } from 'react';
import { db } from './firebase';
import { useAuth } from './auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection,
  DocumentReference,
  FirestoreError
} from 'firebase/firestore';

export interface Stock {
  name: string;
  percentage: number;
}

export function useStocks() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    async function loadStocks() {
      if (!user) {
        setStocks([
          { name: "VTSAX", percentage: 60 },
          { name: "VOO", percentage: 40 },
        ]);
        setLoading(false);
        return;
      }

      try {
        const stocksRef = doc(db, 'userStocks', user.uid);
        const docSnap = await getDoc(stocksRef);
        
        if (docSnap.exists()) {
          setStocks(docSnap.data().stocks);
        } else {
          // Set default stocks for new users
          const defaultStocks = [
            { name: "VTSAX", percentage: 60 },
            { name: "VOO", percentage: 40 },
          ];
          setStocks(defaultStocks);
          try {
            await setDoc(stocksRef, { stocks: defaultStocks });
          } catch (error) {
            const firestoreError = error as FirestoreError;
            console.error('Error creating initial stocks:', firestoreError);
            if (firestoreError.code === 'permission-denied') {
              alert('Please enable Firestore in your Firebase Console and set up security rules');
            }
          }
        }
      } catch (error) {
        const firestoreError = error as FirestoreError;
        console.error('Error loading stocks:', firestoreError);
        if (firestoreError.code === 'permission-denied') {
          alert('Please enable Firestore in your Firebase Console and set up security rules');
        }
      } finally {
        setLoading(false);
      }
    }

    loadStocks();
  }, [user]);

  const saveStocks = async (newStocks: Stock[]) => {
    setStocks(newStocks);
    
    if (user) {
      try {
        const stocksRef = doc(db, 'userStocks', user.uid);
        await setDoc(stocksRef, { stocks: newStocks });
      } catch (error) {
        console.error('Error saving stocks:', error);
      }
    }
  };

  return { stocks, setStocks: saveStocks, loading };
}
