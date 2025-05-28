import RothIRACalculator from './components/RothIRACalculator'
import { AuthProvider } from './lib/auth'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <div className="App">
        <RothIRACalculator />
      </div>
    </AuthProvider>
  );
}

export default App;
