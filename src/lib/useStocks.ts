import { useState, useEffect } from 'react';
import { db } from './firebase';
import { useAuth } from './useAuth';
import { 
  doc, 
  setDoc, 
  getDoc,
} from 'firebase/firestore';
import type { Stock } from '../components/calculator/types';

export function useStocks() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    let mounted = true;

    async function loadStocks() {
      if (!user) {
        if (mounted) {
          setStocks([]);
          setLoading(false);
        }
        return;
      }

      if (mounted) {
        setLoading(true);
      }

      try {
        const stocksRef = doc(db, 'userStocks', user.uid);
        const docSnap = await getDoc(stocksRef);
        
        if (!mounted) return;

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
        if (mounted) {
          setStocks([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadStocks();

    return () => {
      mounted = false;
    };
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
