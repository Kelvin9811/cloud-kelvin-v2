import logo from './logo.svg';
import './App.css';
import awsExports from './aws-exports';
import { Amplify } from 'aws-amplify';
import { Authenticator, useAuthenticator, useTheme, View, Text, Heading, Button, Image, } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import MainScreen from './MainScreen.js';
import KelvinLogo from './images/Kelvin-cloud-logo.png';
import { I18n } from 'aws-amplify/utils';
import { translations } from '@aws-amplify/ui-react';

I18n.putVocabularies(translations);
I18n.setLanguage('es');

I18n.putVocabularies({
  es: {
    'Sign In': 'Iniciar sesión',
    'Sign Up': 'Registrarse',
    'Username': 'Nombre de usuario',
    'Password': 'Contraseña',
    'Forgot your password?': '¿Olvidaste tu contraseña?',
    'Create a new account': 'Crear una nueva cuenta',
    'Enter your Username': 'Ingresa tu nombre de usuario',
  }
});

Amplify.configure(awsExports);


const components = {
  Header() {
    const { tokens } = useTheme();

    return (
      <View textAlign="center" padding={tokens.space.large}>
        <Image src={KelvinLogo} alt="Logo" width="50%" />
      </View>
    );
  },

  SignIn: {
    Header() {
      const { tokens } = useTheme();
      return (
        <Heading padding={`${tokens.space.xl} 0 0 ${tokens.space.xl}`} level={3}>
          Inicia sesión en tu cuenta
        </Heading>
      );
    },
    Footer() {
      const { toForgotPassword } = useAuthenticator();
      return (
        <View textAlign="center">
          <Button fontWeight="normal" onClick={toForgotPassword} size="small" variation="link">
            ¿Olvidaste tu contraseña?
          </Button>
        </View>
      );
    },
  },
  SignUp: {
    Header() {
      const { tokens } = useTheme();
      return (
        <Heading padding={`${tokens.space.xl} 0 0 ${tokens.space.xl}`} level={3}>
          Crear una nueva cuenta
        </Heading>
      );
    },
    Footer() {
      const { toSignIn } = useAuthenticator();
      return (
        <View textAlign="center">
          <Button fontWeight="normal" onClick={toSignIn} size="small" variation="link">
            Regresar a iniciar sesión
          </Button>
        </View>
      );
    },
  },
  ConfirmSignUp: {
    Header() {
      const { tokens } = useTheme();
      return (
        <Heading
          padding={`${tokens.space.xl} 0 0 ${tokens.space.xl}`}
          level={3}
        >
          Enter Information:
        </Heading>
      );
    },
    Footer() {
      return <Text>Footer Information</Text>;
    },
  },
  SetupTotp: {
    Header() {
      const { tokens } = useTheme();
      return (
        <Heading
          padding={`${tokens.space.xl} 0 0 ${tokens.space.xl}`}
          level={3}
        >
          Enter Information:
        </Heading>
      );
    },
    Footer() {
      return <Text>Footer Information</Text>;
    },
  },
  ConfirmSignIn: {
    Header() {
      const { tokens } = useTheme();
      return (
        <Heading
          padding={`${tokens.space.xl} 0 0 ${tokens.space.xl}`}
          level={3}
        >
          Enter Information:
        </Heading>
      );
    },
    Footer() {
      return <Text>Footer Information</Text>;
    },
  },
  ForgotPassword: {
    Header() {
      const { tokens } = useTheme();
      return (
        <Heading
          padding={`${tokens.space.xl} 0 0 ${tokens.space.xl}`}
          level={3}
        >
          Enter Information:
        </Heading>
      );
    },
    Footer() {
      return <Text>Footer Information</Text>;
    },
  },
  ConfirmResetPassword: {
    Header() {
      const { tokens } = useTheme();
      return (
        <Heading
          padding={`${tokens.space.xl} 0 0 ${tokens.space.xl}`}
          level={3}
        >
          Enter Information:
        </Heading>
      );
    },
    Footer() {
      return <Text>Footer Information</Text>;
    },
  },
  SelectMfaType: {
    Header() {
      return <Heading level={3}>Select Desired MFA Type</Heading>;
    },
    Footer() {
      return <Text>Footer Information</Text>;
    },
  },
  SetupEmail: {
    Header() {
      return <Heading level={3}>Email MFA Setup</Heading>;
    },
    Footer() {
      return <Text>Footer Information</Text>;
    },
  },
};


function App() {
  return (
    <div className="App">
      <header className="App-header">
        <Authenticator components={components}>
          {({ signOut, user }) => (
            <MainScreen user={user} signOut={signOut} />
          )}
        </Authenticator>
      </header>
    </div>
  );
}

export default App;
