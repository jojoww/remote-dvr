import { createTheme, ThemeProvider, useMediaQuery } from '@mui/material';
import React, { useEffect } from 'react';
import DVRMenu from './components/DVRMenu';


function App() {
  const [channels, setChannels] = React.useState(['test', 'test2']);

  const addChannel = (newChannel: string) => {}
  
    // const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const prefersDarkMode = true;

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: prefersDarkMode ? 'dark' : 'light',
        },
      }),
    [prefersDarkMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <DVRMenu message={'hello'} channels={channels}/>
      <div id="mainCanvasHolder"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          backgroundColor: "#cccccc"
        }} />
      <div id="inset"
        style={{
          width: "10vmin",
          height: "10vmin",
          backgroundColor: "transparent",
          border: "0px solid rgb(22, 105, 230)",
          margin: "0px",
          padding: "0px",
          position: "absolute",
          left: "0px",
          bottom: "0px",
          zIndex: "100"
        }}
      />
    </ThemeProvider>
  );
}

export default App;
