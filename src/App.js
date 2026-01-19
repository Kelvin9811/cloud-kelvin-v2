import logo from './logo.svg';
import './App.css';
import awsExports from './aws-exports';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import MainScreen from './MainScreen.js';

Amplify.configure(awsExports);

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <Authenticator>
          {({ signOut, user }) => (
            <MainScreen user={user} signOut={signOut} />
          )}
        </Authenticator>
      </header>
    </div>
  );
}

export default App;
