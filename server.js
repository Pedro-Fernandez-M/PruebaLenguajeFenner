// Arranque del servidor local. En el liceo basta con `npm start` y que los
// alumnos entren desde su navegador a la IP que se imprime abajo.
import os from 'node:os';
import { crearApp } from './src/app.js';

const puerto = Number(process.env.PORT || 3000);

function direccionesLocales() {
  const salida = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const i of interfaces || []) {
      if (i.family === 'IPv4' && !i.internal) salida.push(i.address);
    }
  }
  return salida;
}

const { app, credenciales } = await crearApp();

app.listen(puerto, '0.0.0.0', () => {
  console.log('');
  console.log('  Plataforma DIA — evaluación diagnóstica');
  console.log('  ─────────────────────────────────────────────────────');
  console.log('  Panel docente : http://localhost:' + puerto + '/profesor');
  console.log('  Alumnos       : http://localhost:' + puerto + '/');
  for (const ip of direccionesLocales()) {
    console.log('  En la red     : http://' + ip + ':' + puerto + '/');
  }
  if (credenciales) {
    console.log('');
    console.log('  Cuenta docente creada en este primer arranque:');
    console.log('    correo      : ' + credenciales.email);
    console.log('    contraseña  : ' + credenciales.password);
    console.log('  Cámbiala desde el panel apenas ingreses.');
  }
  console.log('');
});
