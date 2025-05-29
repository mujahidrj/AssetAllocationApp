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
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setStocks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    async function loadStocks() {
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
          await setDoc(stocksRef, { stocks: defaultStocks });
        }
      } catch (error) {
        console.error('Error loading stocks:', error);
        setStocks([]);
      } finally {
        setLoading(false);
      }
    }

    loadStocks();
  }, [user]);

  const setStocksWithSync = async (newStocks: Stock[]) => {
    if (!user) {
      return;
    }

    try {
      const stocksRef = doc(db, 'userStocks', user.uid);
      await setDoc(stocksRef, { stocks: newStocks });
      setStocks(newStocks);
    } catch (error) {
      console.error('Error updating stocks:', error);
    }
  };

  return {
    stocks,
    setStocks: setStocksWithSync,
    loading
  };
}
