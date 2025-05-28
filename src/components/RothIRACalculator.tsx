import { useState, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useStocks } from '../lib/useStocks';
import { useAuth } from '../lib/auth';
import { LoginButton } from './LoginButton';

function RothIRACalculator() {
  const [amount, setAmount] = useState("");
  const { stocks, setStocks, loading } = useStocks();
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [newStockName, setNewStockName] = useState("");

  const addStock = () => {
    if (!newStockName.trim()) {
      setError("Please enter a stock name");
      return;
    }
    setStocks([...stocks, { name: newStockName.toUpperCase(), percentage: 0 }]);
    setNewStockName("");
    setError("");
  };

  const removeStock = (index: number) => {
    setStocks(stocks.filter((_, i) => i !== index));
  };

  const updateStockPercentage = (index: number, newPercentage: string) => {
    const updatedStocks = [...stocks];
    updatedStocks[index] = {
      ...updatedStocks[index],
      percentage: parseInt(newPercentage) || 0,
    };
    setStocks(updatedStocks);
  };

  const calculateAllocations = useCallback(() => {
    const totalAmount = parseFloat(amount);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      setError("Please enter a valid positive number");
      return null;
    }

    const totalPercentage = stocks.reduce(
      (sum, stock) => sum + stock.percentage,
      0
    );
    if (totalPercentage !== 100) {
      setError("Percentages must add up to 100%");
      return null;
    }

    setError("");
    return stocks.map((stock) => ({
      name: stock.name,
      percentage: stock.percentage,
      amount: (totalAmount * (stock.percentage / 100)).toFixed(2),
    }));
  }, [amount, stocks, setError]);

  const allocations = useMemo(() => {
    if (!amount) return null;
    return calculateAllocations();
  }, [amount, calculateAllocations]);

  if (loading) {
    return <div className="min-h-screen bg-gray-100 p-8 flex items-center justify-center">
      <div className="text-xl">Loading...</div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-md mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold font-roboto">
            Asset Allocation Calculator
          </h1>
          <LoginButton />
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Amount ($)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Enter amount (e.g. 1000)"
                name="amount"
              />
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="text"
                  value={newStockName}
                  onChange={(e) => setNewStockName(e.target.value)}
                  className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter stock symbol"
                  name="newStock"
                />
                <button
                  onClick={addStock}
                  className="p-2 md:px-3 md:py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  aria-label="Add stock"
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span className="hidden md:inline md:ml-1">Add</span>
                </button>
              </div>

              {stocks.map((stock, index) => (
                <div key={index} className="flex items-center gap-2 mb-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {stock.name} Percentage
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={stock.percentage}
                        onChange={(e) =>
                          updateStockPercentage(index, e.target.value)
                        }
                        className="flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter percentage"
                        name={`stock-${index}-percentage`}
                      />
                      <button
                        onClick={() => removeStock(index)}
                        className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                        aria-label="Remove stock"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {error && <div className="text-red-500 text-sm">{error}</div>}

            {allocations && (
              <div className="mt-6 p-4 bg-gray-50 rounded">
                <h2 className="text-lg font-semibold mb-3">
                  Allocation Results:
                </h2>
                <div className="space-y-2">
                  {allocations.map((allocation, index) => (
                    <div key={index} className="flex justify-between">
                      <span>
                        {allocation.name} ({allocation.percentage}%):
                      </span>
                      <span className="font-medium">${allocation.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RothIRACalculator;
