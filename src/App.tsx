import { AuthProvider } from './lib/auth';
import { Calculator } from './app/Calculator';

function App() {
  return (
    <AuthProvider>
      <Calculator />
    </AuthProvider>
  );
}

export default App;
