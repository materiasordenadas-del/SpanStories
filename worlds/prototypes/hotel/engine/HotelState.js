export const ZONES=['fachada','lobby','conserjeria','restaurante','buffet','bar','terraza','circulacion','galeria','pasillo','habitacion'];
export function crearEstadoHotel() {
  return {zona:'lobby',registro:false,tarjeta:false,tour:null,consumo:[],ascensor:{planta:0,destino:0,viajando:false}};
}
export function registrarEntrada(s) {s.registro=true;s.tarjeta=true;return 'Registro completado. Tu habitación es la 201; recibiste la tarjeta.';}
export function registrarSalida(s) {s.registro=false;s.tarjeta=false;return 'Salida registrada. Gracias por visitar el Hotel Palma Real.';}
export function reservarTour(s,tour) {s.tour=tour;return 'Reserva simulada: '+tour+'. Conserjería preparó tu itinerario.';}
export function pedir(s,item) {s.consumo.push(item);return 'Pedido: '+item+'.';}
export function iniciarViaje(s,planta) {if(s.ascensor.viajando)return false;if(![0,1].includes(planta))throw new Error('Planta inválida');s.ascensor.destino=planta;s.ascensor.viajando=true;return true;}
export function terminarViaje(s) {s.ascensor.planta=s.ascensor.destino;s.ascensor.viajando=false;s.zona=s.ascensor.planta?'galeria':'circulacion';return s.zona;}
