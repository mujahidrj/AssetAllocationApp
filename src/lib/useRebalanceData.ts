import { useState, useEffect } from 'react';
import { db } from './firebase';
import { useAuth } from './auth';
import { 
  doc, 
  setDoc, 
  getDoc,
} from 'firebase/firestore';
import type { CurrentPosition, Stock } from '../components/calculator/types';

export function useRebalanceData() {
  const [currentPositions, setCurrentPositions] = useState<CurrentPosition[]>([]);
  const [rebalanceStocks, setRebalanceStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    let mounted = true;

    async function loadRebalanceData() {
      if (!user) {
        if (mounted) {
          setCurrentPositions([]);
          setRebalanceStocks([]);
          setLoading(false);
        }
        return;
      }

      if (mounted) {
        setLoading(true);
      }

      try {
        const positionsRef = doc(db, 'userPositions', user.uid);
        const percentagesRef = doc(db, 'userRebalancePercentages', user.uid);
        
        const [positionsSnap, percentagesSnap] = await Promise.all([
          getDoc(positionsRef),
          getDoc(percentagesRef)
        ]);
        
        if (!mounted) return;

        if (positionsSnap.exists()) {
          setCurrentPositions(positionsSnap.data().positions || []);
        }

        if (percentagesSnap.exists()) {
          setRebalanceStocks(percentagesSnap.data().stocks || []);
        }
      } catch (error) {
        console.error('Error loading rebalance data:', error);
        if (mounted) {
          setCurrentPositions([]);
          setRebalanceStocks([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadRebalanceData();

    return () => {
      mounted = false;
    };
  }, [user]);

  const setCurrentPositionsWithSync = async (newPositions: CurrentPosition[]) => {
    if (!user) {
      setCurrentPositions(newPositions);
      return;
    }

    try {
      const positionsRef = doc(db, 'userPositions', user.uid);
      await setDoc(positionsRef, { positions: newPositions });
      setCurrentPositions(newPositions);
    } catch (error) {
      console.error('Error updating positions:', error);
    }
  };

  const setRebalanceStocksWithSync = async (newStocks: Stock[]) => {
    if (!user) {
      setRebalanceStocks(newStocks);
      return;
    }

    try {
      const percentagesRef = doc(db, 'userRebalancePercentages', user.uid);
      await setDoc(percentagesRef, { stocks: newStocks });
      setRebalanceStocks(newStocks);
    } catch (error) {
      console.error('Error updating rebalance percentages:', error);
    }
  };

  return {
    currentPositions,
    setCurrentPositions: setCurrentPositionsWithSync,
    rebalanceStocks,
    setRebalanceStocks: setRebalanceStocksWithSync,
    loading
  };
}
