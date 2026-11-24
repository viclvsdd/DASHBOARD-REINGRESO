'use strict';

/* ================================================================
   1. CONFIGURACIÓN Y CONSTANTES
   ================================================================ */
const CONFIG = {
  STORAGE_KEY:        'seguimiento_clientes',
  STORAGE_TAB_KEY:    'seguimiento_tab_actual',
  STORAGE_METODO_KEY: 'seguimiento_metodo_filtro',
  CLIENTES_POR_PAGINA: 30,
  DEBOUNCE_MS:        200,
};

const METODOS = {
  sin_contacto: { label: '',            clase: 'metodo-sin-contacto' },
  llamada:      { label: 'Llamada',      clase: 'metodo-llamada' },
  escrito:      { label: 'Escrito',      clase: 'metodo-escrito' },
  ambos:        { label: 'Ambos',        clase: 'metodo-ambos' },
};

const ESTADOS = {
  pendiente:      { label: 'Pendiente',      clase: 'estado-pendiente', color: '#e0e1dd' },
  se_le_escribio: { label: 'Se le escribió', clase: 'estado-escribio', color: '#a3b18a' },
  no_respondio:   { label: 'No respondió',   clase: 'estado-no-respondio', color: '#c9bcc0' },
  posiblemente:   { label: 'Posiblemente',   clase: 'estado-posiblemente', color: '#d4a373' },
  dijo_que_si:    { label: 'Dijo que sí',    clase: 'estado-si', color: '#6b8e23' },
  dijo_que_no:    { label: 'Dijo que no',    clase: 'estado-no', color: '#b03030' },
  no_contactado:  { label: 'No contactado',  clase: 'estado-no-contactado', color: '#6e585d' },
  confirmado:     { label: 'Confirmado',     clase: 'estado-confirmado', color: '#2e7d4f' },
};

const RAZONES_RETIRO = {
  ninguna:          { label: '',                                       clase: 'razon-ninguna' },
  no_interesa:      { label: 'No le interesa',                         clase: 'razon-no-interesa' },
  sin_dinero:       { label: 'Sin presupuesto',                        clase: 'razon-sin-dinero' },
  servicio:         { label: 'Tiene otro servicio',                    clase: 'tiene-otro-servicio' },
  calidad_servicio: { label: 'Problema con la calidad del servicio',   clase: 'problema-calidad' },
};

/* ================================================================
   2. UTILIDADES
   ================================================================ */
const $ = (id) => document.getElementById(id);

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), ms);
  };
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(message, type = 'info', duration = 2800) {
  let container = $('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 8px; max-width: 320px; pointer-events: none;`;
    document.body.appendChild(container);
  }
  const colores = { info: '#3a7ca5', success: '#2e7d4f', warning: '#b8860b', error: '#b03030' };
  const toast = document.createElement('div');
  toast.style.cssText = `background: ${colores[type] || colores.info}; color: #fff; padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.18); font-size: 0.9rem; font-weight: 500; pointer-events: auto; opacity: 0; transform: translateX(20px); transition: opacity .25s, transform .25s;`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; opacity: 0; transition: opacity .15s;`;
    const box = document.createElement('div');
    box.style.cssText = `background: #fbf8f3; border-radius: 12px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.25); color: #2c181d;`;
    box.innerHTML = `<p style="margin-bottom: 20px; font-size: 1rem; line-height: 1.5;">${message}</p><div style="display: flex; gap: 10px; justify-content: flex-end;"><button data-action="cancel" style="padding:8px 16px;border:1px solid #8c2a41;background:transparent;color:#6b1d2f;border-radius:6px;cursor:pointer;font-weight:600;">Cancelar</button><button data-action="confirm" style="padding:8px 16px;border:none;background:#6b1d2f;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;">Confirmar</button></div>`;
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => { backdrop.style.opacity = '1'; });
    const cerrar = (resultado) => {
      backdrop.style.opacity = '0';
      setTimeout(() => backdrop.remove(), 150);
      document.removeEventListener('keydown', onKey);
      resolve(resultado);
    };
    const onKey = (e) => { if (e.key === 'Escape') cerrar(false); };
    box.querySelector('[data-action="cancel"]').onclick  = () => cerrar(false);
    box.querySelector('[data-action="confirm"]').onclick = () => cerrar(true);
    document.addEventListener('keydown', onKey);
  });
}

/* ================================================================
   3. ESTADO GLOBAL Y DATOS BASE
   ================================================================ */
const app = {
  clientes: [], filtrados: [], pagina: 1, modoImprimirTodo: false,
  pestana: 'resumen', filtroMetodo: 'todos', busqueda: '',
  dashTab: 'resumen'
};

const cli = (id, nombre, telefono, metodo = 'sin_contacto', estado = 'pendiente', razonRetiro = 'ninguna') => ({ id, nombre, telefono, metodo, estado, razonRetiro });

const clientesBase = [
  { id: 1, nombre: 'JULIO BERRIS', telefono: '04142717237', metodo: 'llamada', estado: 'dijo_que_no', razonRetiro: 'no_interesa' },
  { id: 2, nombre: 'LILINA MALAVE/ 6557965', telefono: '04242602828', metodo: 'llamada', estado: 'dijo_que_si', razonRetiro: 'ninguna' },
  { id: 3, nombre: 'JUAN CARLOS ANGULO', telefono: '04146120017', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 4, nombre: 'LEONARDO DE LA CRUZ', telefono: '04129891009', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 5, nombre: 'JESUS SILVA', telefono: '04122893795', metodo: 'llamada', estado: 'dijo_que_si', razonRetiro: 'ninguna' },
  { id: 6, nombre: 'FRANCISCO VALDES/19122268', telefono: '04125974544,04242380714', metodo: 'llamada', estado: 'dijo_que_no', razonRetiro: 'no_interesa' },
  { id: 7, nombre: 'EDGAR HERNANDEZ BOSSIO', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 8, nombre: 'LUIS ENRIQUE MURO BRICEÑO', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 9, nombre: 'BEATRIZ RODRIGUEZ/11058011', telefono: '04265448338', metodo: 'llamada', estado: 'dijo_que_si', razonRetiro: 'ninguna' },
  { id: 10, nombre: 'MEDIAMETRICA, C.A.', telefono: '04122600267,04166212743', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 11, nombre: 'RAFAEL ROMERO', telefono: '04143365579', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 12, nombre: 'JOHN PEREIRA', telefono: '04126092275', metodo: 'llamada', estado: 'dijo_que_no', razonRetiro: 'no_interesa' },
  { id: 13, nombre: 'TOMAS DIAZ', telefono: '04123221742', metodo: 'llamada', estado: 'dijo_que_si', razonRetiro: 'ninguna' },
  { id: 14, nombre: 'EMILIO GARCIA', telefono: '04166061501', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 15, nombre: 'ANDRES SIMON GONZALES SILEN', telefono: '04143203526, 04242192655', metodo: 'llamada', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 16, nombre: 'EDGAR GARCIA', telefono: '04142442709', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 17, nombre: 'CARACAS COUNTRY CLUB/J-00041027-5', telefono: '04248675526', metodo: 'llamada', estado: 'dijo_que_si', razonRetiro: 'ninguna' },
  { id: 18, nombre: 'NERINA ALLIEGRO MORALES', telefono: '04141293912', metodo: 'llamada', estado: 'dijo_que_si', razonRetiro: 'ninguna' },
  { id: 19, nombre: 'JESSICA PUCCI', telefono: '', metodo: 'llamada', estado: 'confirmado', razonRetiro: 'ninguna' },
  { id: 20, nombre: 'SIBEYA GARTNER', telefono: '04140141446', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 21, nombre: 'PATRICIA VEGA', telefono: '04144245690', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 22, nombre: 'YOCHCELIN ALFONZO/11557525', telefono: '04142549652', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 23, nombre: 'FREDDY ENRIQUE BELISARIO GALLIPOLL/5530967', telefono: '04141293904', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 24, nombre: 'FRANCISCA VILORIA', telefono: '04126287328', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 25, nombre: 'ENRIQUE HERERA RAINEAU', telefono: '04242661638', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 26, nombre: 'ANTONIO DITTMAR', telefono: '04143333367', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 27, nombre: 'JUAN PABLO ZAMBRANO', telefono: '04142352340', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 28, nombre: 'GIOVANNI CHICCO', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 29, nombre: 'TANIA SALAZAR PALACIOS', telefono: '04241383069', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 30, nombre: 'VICENTE SARRÍA', telefono: '04141739600', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 31, nombre: 'BOLSA DE VALORES DE CARACAS', telefono: '', metodo: 'sin_contacto', estado: 'no_contactado', razonRetiro: 'ninguna' },
  { id: 32, nombre: 'EDUARDO TRENARD', telefono: '', metodo: 'llamada', estado: 'dijo_que_no', razonRetiro: 'no_interesa' },
  { id: 33, nombre: 'JORGE VALERI MATA', telefono: '04122644691', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 34, nombre: 'JOHAMS EMANUEL CABALLERO/9723409', telefono: '04146220668', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 35, nombre: 'JORGE VALERI MATA', telefono: '04122644691', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 36, nombre: 'GLORIA CAPRILES/3291356', telefono: '04123766761', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 37, nombre: 'DARWIN MORALES/9692344', telefono: '04123279466', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 38, nombre: 'DANIEL ABREU/4771294', telefono: '04242266689, 04143281131', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 39, nombre: 'CARLOS JAVIER NIEVES/20309950', telefono: '04142545901', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 40, nombre: 'LILINA MALAVE / 6557965', telefono: '04242602828,04166226559', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 41, nombre: 'HECTOR GARCIA', telefono: '04242127940', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 42, nombre: 'WILLIAM SAVELLI/2949335', telefono: '04141956303', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 43, nombre: 'UNIPUT C.A.', telefono: '', metodo: 'llamada', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 44, nombre: 'INVERSIONES THREETOM 2356, C.A./J-40728690-0', telefono: '04242044691, 04123579636', metodo: 'sin_contacto', estado: 'no_contactado', razonRetiro: 'ninguna' },
  { id: 45, nombre: 'LUIS ANTONIO CORTEZ HERNANDEZ', telefono: '04141353603,04269153052,04242927329', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 46, nombre: 'MAXIMO ATTARDI / 6930976', telefono: '04248685030', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 47, nombre: 'CARMEN PLANCHART', telefono: '04122466737', metodo: 'sin_contacto', estado: 'no_contactado', razonRetiro: 'ninguna' },
  { id: 48, nombre: 'SATOSHI ASSET MANAGEMENT, C.A.', telefono: '04242885458', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 49, nombre: 'DANIEL MARTINEZ', telefono: '04242298520', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 50, nombre: 'MINERVA SALAS', telefono: '04122663342', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 51, nombre: 'CRISTOBAL LANDER', telefono: '04248252483', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 52, nombre: 'DANIEL CALORE PAVAN', telefono: '04123314959', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 53, nombre: 'FRANKLIN RIVERO', telefono: '', metodo: 'sin_contacto', estado: 'no_contactado', razonRetiro: 'ninguna' },
  { id: 54, nombre: 'ALFREDO MACHADO', telefono: '04127044477', metodo: 'llamada', estado: 'dijo_que_no', razonRetiro: 'no_interesa' },
  { id: 55, nombre: 'CARLOS ADOLFO ROMERO PRIETO', telefono: '04142404840', metodo: 'llamada', estado: 'dijo_que_no', razonRetiro: 'no_interesa' },
  { id: 56, nombre: 'OMAR SAMANIEGO', telefono: '04241905710', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 57, nombre: 'ANDRES SANTANA', telefono: '04124808038', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 58, nombre: 'EDUARDO MORELLI', telefono: '04143357250', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 59, nombre: 'FRANCISCO SEGNINI', telefono: '04143081107', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 60, nombre: 'RICARDO GRANDINETTI', telefono: '04143313122', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 61, nombre: 'ADRIANA CAROLINA CALORE FERNANDEZ', telefono: '04123321506', metodo: 'llamada', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 62, nombre: 'INVERSIONES HLL32PB C.A. (OFIC. 309)', telefono: '04241320911', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 63, nombre: 'RAFAEL HERRERA', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 64, nombre: 'RUXIL RIVAS', telefono: '04128853691', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 65, nombre: 'ADRIANA CAMPAGNARO', telefono: '04143326756', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 66, nombre: 'ENRIQUE GIRON', telefono: '04166069542', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 67, nombre: 'GUSTAVO PINTO', telefono: '04143210265', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 68, nombre: 'INGRID CAVALIERI', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 69, nombre: 'CARLOS GMON MONSALVE', telefono: '04265162041', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 70, nombre: 'DAYANA LEON', telefono: '04241390583', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 71, nombre: 'CARMEN GISELA CRUZ', telefono: '04143249752', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 72, nombre: 'MARIA FERNANDA FLORES', telefono: '04242441043', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 73, nombre: 'mauricio duran soporte', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 74, nombre: 'LUIS RUBANO', telefono: '04141369891', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 75, nombre: 'JUAN IGNACIO RODRIGUEZ', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 76, nombre: 'FREDERICK GUTIERREZ', telefono: '04141619110', metodo: 'llamada', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 77, nombre: 'LUCA ARANEO/12.422.099', telefono: '04122840974', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 78, nombre: 'LUIS ENRIQUE MARTINEZ/17064423', telefono: '04241244314', metodo: 'llamada', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 79, nombre: 'LUIS GUINAND/6558583', telefono: '04142572303,04149234587', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 80, nombre: 'MARIA NORA PARIS DE CHAPELLIN', telefono: '04141479308,04143215948', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 81, nombre: 'TOMOMI NAKADA/19401095', telefono: '04123954612,04241758202', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 82, nombre: 'LAGUNITA COUNTRY CLUB A.C.', telefono: '04148250987 - 04126022261', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 83, nombre: 'MICHAEL ALBERTO RONDON TEJON', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 84, nombre: 'JULIETA GONZALEZ DE GAGO', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 85, nombre: 'PAOLA CAROLINA DELGADO', telefono: '04141193108', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 86, nombre: 'MICHAEL ALEXANDER VOTTELER ZDANIS', telefono: '04120200442', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 87, nombre: 'HERMANN DEGWITZ', telefono: '04123349489', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 88, nombre: 'ADOLFO DE LIMA ELJURI', telefono: '04166058293', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 89, nombre: 'AURA LAZO', telefono: '04141730344', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 90, nombre: 'TULIA MONSALVE', telefono: '04122488542', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 91, nombre: 'PAUL F. LINAREZ S', telefono: '04143502329', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 92, nombre: 'HENRY LORD D SOLA', telefono: '04242657600', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 93, nombre: 'JUAN ENRIQUE CROES CAMPBELL', telefono: '04141804881', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 94, nombre: 'ERVIN HIRSCH', telefono: '04142495034', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 95, nombre: 'MARIA SOLEDAD SOJO', telefono: '04143272794', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 96, nombre: 'GONZALO SEGUNDO JORDAN GOMEZ', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 97, nombre: 'LUIS FERNANDO PEREZ ROMERO', telefono: '04142836114', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 98, nombre: 'ALCALDIA MUNICIPIO CHACAO / DESPACHO', telefono: '04123053828', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 99, nombre: 'MARCO GONZALEZ', telefono: '04143117857', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 100, nombre: 'LUIS GARCIA', telefono: '04143120107', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 101, nombre: 'JUAN JOSE MARI HABERKORN', telefono: '04166079155', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 102, nombre: 'LISBETH VARGAS', telefono: '04241705038', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 103, nombre: 'LUIS GUILLERMO ALTUVE PERERA/20050648', telefono: '04122606622', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 104, nombre: 'CESAR CARRILLO/14527351', telefono: '04242680521, 04241732930', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 105, nombre: 'MARIA ELENA RENAR', telefono: '04241365786', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 106, nombre: 'JOSE GREGORIO DIAZ LUIS', telefono: '04120123921', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 107, nombre: 'RICARDO GONZALEZ PALACIOS', telefono: '04142727007', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 108, nombre: 'MARIEN PADILLA', telefono: '04142703847', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 109, nombre: 'WILLIAM SANCHEZ', telefono: '04141101727', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 110, nombre: 'MASSIMO ZORATTI', telefono: '04149681189', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 111, nombre: 'Diana Duque', telefono: '04142919810', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 112, nombre: 'RAFAEL CURVELO', telefono: '04129568949', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 113, nombre: 'LARA BLACKLORCK', telefono: '04123093446', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 114, nombre: 'DIEGO BEDOYA LEON', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 115, nombre: 'LUCIA SCHAWARZ', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 116, nombre: 'KIMBEL BRITO', telefono: '04141236404', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 117, nombre: 'JOSE F. BRUZUAL', telefono: '04141096886', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 118, nombre: 'MARIA ANTONIETA FRAILE CHIRINOS', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 119, nombre: 'NELSON J. MARTINEZ BELISARIO/9961125', telefono: '04241565482, 04242473489', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 120, nombre: 'NEMESIS GOMEZ/13190154', telefono: '04147977875, 04122529077', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 121, nombre: 'JOSE LLAVANERAS', telefono: '04149853284', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 122, nombre: 'AURELIO ARANGUREN', telefono: '04242600544', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 123, nombre: 'LUIS RANGEL', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 124, nombre: 'ALEJANDRO ALBERTO GONZALEZ PARENTE', telefono: '04241616257', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 125, nombre: 'MARIA FERNANDA HURTADO GONZALEZ', telefono: '04147456331', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 126, nombre: 'OSCAR A CANDIALES', telefono: '04143251021', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 127, nombre: 'MARIANA MONTENEGRO DÍAZ', telefono: '04143120089', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 128, nombre: 'MANUEL LOPEZ HERRERA', telefono: '04246210021', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 129, nombre: 'JUAN CARLOS FRANCO', telefono: '04124704008', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 130, nombre: 'ROSA VIRGINIA GOMEZ', telefono: '04242638003', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 131, nombre: 'OMAR ALVAREZ H', telefono: '04123072396', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 132, nombre: 'MARY ANNA QUINTERO', telefono: '04141347403', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 133, nombre: 'MARIA ISABEL BLANCH DE CARBALLO', telefono: '04126083003', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 134, nombre: 'REBECA HERNANDEZ', telefono: '04145314831', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 135, nombre: 'MAYKEL MARTINEZ G', telefono: '04141108273', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 136, nombre: 'JOSE HUMBERTO VEGA', telefono: '04149356151', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 137, nombre: 'PEDRO L. GUZMAN G', telefono: '04142454167', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 138, nombre: 'MARIA EUGENIA MATHIES', telefono: '04122272966', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 139, nombre: 'LUZ MARINA MONASTERIOS/13845201', telefono: '04125853505', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 140, nombre: 'AARON GARCIA CASTELLANO', telefono: '04242713969', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 141, nombre: 'RADIVOJE JOVANOVIC K', telefono: '04143265034', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 142, nombre: 'BASILIO BADIOLA D', telefono: '04166274460', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 143, nombre: 'AMADO LOPEZ', telefono: '04241871846', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 144, nombre: 'JOSE M. CABEZA', telefono: '04143212548', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 145, nombre: 'Juan Chacon / 26064639', telefono: '04242889840', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 146, nombre: 'GERMAN PARRA/9953567', telefono: '04246302020', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 147, nombre: 'SANDRA ELENA DE NOBREGA', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 148, nombre: 'JOHANNA PAREDES', telefono: '04149062914', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 149, nombre: 'TONY RODRIGUEZ (Convenio Empleado)', telefono: '04168224489', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 150, nombre: 'RICHARD R. TORO LORENZO/5514508', telefono: '04122280860', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 151, nombre: 'RICARDO ANTONIO LINARES ARENAS/17646687', telefono: '04147383972', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 152, nombre: 'ANDRES ORTEGA / 6841844', telefono: '04142375366', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 153, nombre: 'ANDRES TINOCO/9872988', telefono: '04141050027', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 154, nombre: 'FRIEDRICH BREISACHER', telefono: '04241558777', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 155, nombre: 'JOHAN RAMON ROSALES VELANDIA', telefono: '04141134000,04166134000', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 156, nombre: 'PEDRO PARRA', telefono: '04143205405', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 157, nombre: 'MARVIN ANTONIO FERNANDEZ/12640685', telefono: '04141331354', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 158, nombre: 'Mauricio Rivero/19693928', telefono: '04241221398', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 159, nombre: 'Alfredo Gerardo Romero Mendoza', telefono: '0414-277.80.91', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 160, nombre: 'JUAN PABLO DA SILVA NOVO', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 161, nombre: 'PAULA BEVILACQUA', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 162, nombre: 'ALBERTO ANDRES TABJA ALTERNATT', telefono: '04141556838', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 163, nombre: 'JUAN CARLOS ANTILLANO', telefono: '04143703560', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 164, nombre: 'LUIS R. LEON G', telefono: '04143023600', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 165, nombre: 'MARIA EMILIA TORRES', telefono: '04126221310', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 166, nombre: 'MAXIMILIEM MERCKX', telefono: '04140301401', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 167, nombre: 'VINCENCIO CORONA / HUMBOLT', telefono: '04143057787', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 168, nombre: 'JOHAN STUVE', telefono: '04141400803', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 169, nombre: 'SANDRA GORDILLO', telefono: '04142391150', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 170, nombre: 'RAFAEL CAMPOSEO', telefono: '04142095279', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 171, nombre: 'VIOLETA GUALARRAMA PAEZ', telefono: '04142201115', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 172, nombre: 'WILSON OLIVEROS', telefono: '04242129855', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 173, nombre: 'RAMON ROMERO', telefono: '04142675799', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 174, nombre: 'RAFAEL CASTELLANO', telefono: '04140210838', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 175, nombre: 'ISABEL MONTILLA', telefono: '04120993659', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 176, nombre: 'LUIS ALBERTO CASTRO ENRIQUEZ', telefono: '04122342205', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 177, nombre: 'LOLA MARMOL', telefono: '04143277485', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 178, nombre: 'JUAN MARCOS IMERY GUZMAN', telefono: '04242773363', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 179, nombre: 'JAVIER MONAGAS', telefono: '04122618460', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 180, nombre: 'MARIA DEL PUY MENACHES', telefono: '04129378503', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 181, nombre: 'ANA CAROLINA ANDRADE', telefono: '04123204881', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 182, nombre: 'ALFONSO L. VIDAL', telefono: '04242768047', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 183, nombre: 'RICARDO HERMIDA', telefono: '04141613331', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 184, nombre: 'GIANCARLOS MARI', telefono: '04242278661', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 185, nombre: 'SAMUEL LEVY', telefono: '02129758382', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 186, nombre: 'GUSTAVO HIDALGO', telefono: '4242646027', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 187, nombre: 'ALCIDES JOSE PINTO ROJAS', telefono: '04142525629', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 188, nombre: 'GABRIEL RAMIREZ', telefono: '04143195573', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 189, nombre: 'ANGELA ZORAIDA BELLO', telefono: '04143210265', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 190, nombre: 'ANABELA SUCRE/ SONIA FAGRE', telefono: '04142497858', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 191, nombre: 'ANA GUERRA', telefono: '04141520019', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 192, nombre: 'LUIS GUILLERMO CASIQUE', telefono: '04141121318', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 193, nombre: 'ANTONIOS NAIM', telefono: '04141408496', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 194, nombre: 'JULIO MARQUEZ', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 195, nombre: 'ISABEL RAMIREZ RUIZ', telefono: '+584143212128', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 196, nombre: 'RICARDO DATO', telefono: '04141531334', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 197, nombre: 'LILIANA GAVIDIA', telefono: '04166202543', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 198, nombre: 'GONZALO ASUAJE DIAZ', telefono: '04141780720', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 199, nombre: 'INVERSIONES CAMPITOS MOTORS C.A.', telefono: '04123226396', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 200, nombre: 'JUAN CARLOS RODRIGUEZ HERNANDEZ', telefono: '04165398333', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 201, nombre: 'ILKA GARCIA', telefono: '04143112031', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 202, nombre: 'ALICE LINAREZ', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 203, nombre: 'KATHERINE ARELLANO', telefono: '04242516135', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 204, nombre: 'MARIELA HEREDIA', telefono: '04242926707', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 205, nombre: 'MARIBEL DA SILVA', telefono: '04142546165', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 206, nombre: 'JOSE GUERRERO TORRES', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 207, nombre: 'MARTHA GAVIDIA', telefono: '04248890820', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 208, nombre: 'CALZADOS DORIA C.A.', telefono: '02122328077', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 209, nombre: 'RAMON MONTAÑO', telefono: '04141812992', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 210, nombre: 'ALEXIS GARCIA', telefono: '04142012607', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 211, nombre: 'BELKIS BALLIACHE', telefono: '04143307668', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 212, nombre: 'TITO ARGENIS DAZA', telefono: '04126014290', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 213, nombre: 'ANDREA DINORAK RODRIGUEZ RAMIREZ', telefono: '04241483100', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 214, nombre: 'INSTITUTO GASTRONOMICO NUBO C.A.', telefono: '04120291499', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 215, nombre: 'ARIS MENA', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 216, nombre: 'ABEL DURAN', telefono: '04122304526, 04242444735', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 217, nombre: 'MARIA TERESA GONZALEZ', telefono: '04143070755', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 218, nombre: 'BRAULIO DA SILVA', telefono: '04241224968', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 219, nombre: 'JACQUELINE RENARD', telefono: '04241346330', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 220, nombre: 'INVERSIONES ROSMARINOS I', telefono: '04166089065', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 221, nombre: 'LOS NARANJOS', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 222, nombre: 'LUIS FERNANDO DIAZ', telefono: '04126151013', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 223, nombre: 'LUIS CHINDEMI', telefono: '04143247344', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 224, nombre: 'ANDY OSORIO / JOSE ROJAS', telefono: '04242503976', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 225, nombre: 'MELANIE BRICHTA', telefono: '04123116098', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 226, nombre: 'GUSTAVO FERRARO', telefono: '04143377276', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 227, nombre: 'CARMEN GABRIELA SALAZAR', telefono: '04125157105', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 228, nombre: 'KATINA MARGARITA SANANEZ DE VILLALOBOS', telefono: '04125989415', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 229, nombre: 'JESUS ABBAD', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 230, nombre: 'LEONARDO JOSE SALA GONZALEZ/5537713', telefono: '04242555009', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 231, nombre: 'JACQUELINE KASRMERLLIE', telefono: '04149296144 , 04129856977', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 232, nombre: 'ADRIANA GUZMAN TRILLOS', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 233, nombre: 'MIGUEL T. NIÑO', telefono: '04142086473', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 234, nombre: 'JOSE FLORENCIO JIMENEZ LARA/10338018', telefono: '04122877942', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 235, nombre: 'MONIQUE HORANDE/1728280', telefono: '04166233938', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 236, nombre: 'TONY FAGRE', telefono: '04142401131', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 237, nombre: 'MARCIAL BARRIOS', telefono: '0414-7447276', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 238, nombre: 'DANIUSKA SANCHEZ', telefono: '04120509245', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 239, nombre: 'DUAN SUMINISTROS', telefono: '04122514012', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 240, nombre: 'ELENA SOFIA REYES MARI', telefono: '04123176376', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 241, nombre: 'MADERAS MARICHE MM C.A.', telefono: '02122454444', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 242, nombre: 'LUIS GARCIA / 24311732 / vista hermosa 2', telefono: '04241562984', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 243, nombre: 'MARIA DEL CARMEN VALENCIA', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 244, nombre: 'ENGELBERT BRACAMONTE', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 245, nombre: 'LUIS GARCIA/24311732', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 246, nombre: 'BENJAMIN PADILLA B', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 247, nombre: 'GLADYS ZULAY SANCHEZ BENITEZ', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 248, nombre: 'KABIR DA CAMARA', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 249, nombre: 'ZULAY GARCIA CHAVEZ', telefono: '04126078004', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 250, nombre: 'FERNANDO RAFAEL LOPEZ PERALES', telefono: '', metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' },
  { id: 251, nombre: 'VALERIA NAVARRO', telefono: '04126009067', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 252, nombre: 'CARMEN EDITH CARDOSO', telefono: '02129883405', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 253, nombre: 'WILFREDO SOLANO', telefono: '02129532347', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 254, nombre: 'MARIA VICTORIA CORREIA', telefono: '', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 255, nombre: 'JOHANNA ESCALONA / ROMERO', telefono: '04141368103', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 256, nombre: 'SOFIA BOLIVAR', telefono: '0412-7341275', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 257, nombre: 'VIRGILIO CARREÑO', telefono: '04167188333', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 258, nombre: 'LIZZET RICARDI', telefono: '04241356679', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 259, nombre: 'MAYLIN FONSECA J', telefono: '04141020753', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 260, nombre: 'JOSE SIMON MANZUR BRAVO', telefono: '04141732300', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 261, nombre: 'ROBINSON JOSE HURTADO', telefono: '0212 9773045', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 262, nombre: 'CYNTHIA MENDEZ', telefono: '04122295748', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 263, nombre: 'OSCAR MOREAN', telefono: '04142705128', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 264, nombre: 'GINO CORDIVANI', telefono: '04126066225', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' },
  { id: 265, nombre: 'EDUARDO BETANCOURT', telefono: '', metodo: 'escrito', estado: 'no_respondio', razonRetiro: 'ninguna' }
];

/* ================================================================
   4. PERSISTENCIA Y MIGRACIÓN
   ================================================================ */
function leerClientesGuardados() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) { return []; }
}

function guardar() {
  try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(app.clientes)); } 
  catch (err) { showToast('Error al guardar en el navegador', 'error'); }
}

function migrarCliente(c) {
  if (c.metodo && METODOS[c.metodo] && c.estado && ESTADOS[c.estado]) {
    return { metodo: c.metodo, estado: c.estado, razonRetiro: c.razonRetiro || 'ninguna' };
  }
  let metodo = 'sin_contacto', estado = 'pendiente';
  if (c.llamado && c.escrito) metodo = 'ambos'; else if (c.llamado) metodo = 'llamada'; else if (c.escrito) metodo = 'escrito';
  if (c.confirmado) estado = 'confirmado'; else if (c.noContactado) estado = 'no_contactado'; else if (c.escrito) estado = 'se_le_escribio'; else if (c.llamado) estado = 'no_respondio';
  return { metodo, estado, razonRetiro: 'ninguna' };
}

function inicializarClientes() {
  const guardados = leerClientesGuardados();
  if (guardados.length === 0) return clientesBase.map(c => ({ ...c }));
  const mapaGuardados = new Map(guardados.map(c => [String(c.nombre || '').trim().toUpperCase(), c]));
  const resultado = [];
  
  clientesBase.forEach(base => {
    const clave = base.nombre.trim().toUpperCase();
    const guardado = mapaGuardados.get(clave);
    if (guardado) {
      const tel = (guardado.telefono && guardado.telefono !== '-') ? guardado.telefono : base.telefono;
      const mig = migrarCliente(guardado);
      resultado.push({ ...base, telefono: tel, metodo: mig.metodo, estado: mig.estado, razonRetiro: mig.razonRetiro });
      mapaGuardados.delete(clave);
    } else {
      resultado.push({ ...base });
    }
  });
  
  mapaGuardados.forEach(extra => {
    const mig = migrarCliente(extra);
    resultado.push({ id: resultado.length + 1, nombre: extra.nombre, telefono: extra.telefono || '', metodo: mig.metodo, estado: mig.estado, razonRetiro: mig.razonRetiro });
  });
  return resultado;
}

/* ================================================================
   5. LÓGICA DE FILTROS Y UI
   ================================================================ */
function actualizarBarraFiltros() {
  const bar = $('active-filters-bar');
  const chipsContainer = $('filter-chips');
  chipsContainer.innerHTML = '';
  let hayFiltros = false;

  if (app.pestana !== 'resumen' && app.pestana !== 'todos') {
    hayFiltros = true;
    chipsContainer.innerHTML += `<span class="filter-chip">Estado: ${ESTADOS[app.pestana].label}</span>`;
  }
  if (app.filtroMetodo !== 'todos') {
    hayFiltros = true;
    chipsContainer.innerHTML += `<span class="filter-chip">Método: ${METODOS[app.filtroMetodo].label}</span>`;
  }
  if (app.busqueda.trim() !== '') {
    hayFiltros = true;
    chipsContainer.innerHTML += `<span class="filter-chip">Búsqueda: "${app.busqueda}"</span>`;
  }
  bar.style.display = hayFiltros ? 'flex' : 'none';
}

window.limpiarFiltros = function() {
  app.pestana = 'resumen';
  app.filtroMetodo = 'todos';
  app.busqueda = '';
  $('search-input').value = '';
  $('filtro-metodo').value = 'todos';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'resumen'));
  aplicarFiltros();
  showToast('Filtros limpiados', 'info');
};

window.filtrarPorPestana = function(pestana) {
  app.pestana = pestana;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === pestana));
  aplicarFiltros();
};

window.cambiarFiltroMetodo = function (val) {
  app.filtroMetodo = val;
  aplicarFiltros();
};

function aplicarFiltros() {
  const termino = app.busqueda.trim().toUpperCase();
  app.filtrados = app.clientes.filter(c => {
    const busq = termino === '' || c.nombre.toUpperCase().includes(termino) || (c.telefono && c.telefono.toUpperCase().includes(termino));
    const pest  = app.pestana === 'resumen' || app.pestana === 'todos' ? true : c.estado === app.pestana;
    const met   = app.filtroMetodo === 'todos' || c.metodo === app.filtroMetodo;
    return busq && pest && met;
  });
  app.pagina = 1;
  actualizarBarraFiltros();
  renderizarTabla();
  actualizarDashboard();
}

const buscarDebounced = debounce(() => { app.busqueda = $('search-input').value; aplicarFiltros(); }, CONFIG.DEBOUNCE_MS);

function renderizarTabla() {
  const tbody = $('client-list');
  if (!tbody) return;
  const scrollY = window.scrollY;
  tbody.innerHTML = '';

  const totalPags = Math.max(1, Math.ceil(app.filtrados.length / CONFIG.CLIENTES_POR_PAGINA));
  if (app.pagina > totalPags) app.pagina = totalPags;

  let aMostrar = app.filtrados;
  if (!app.modoImprimirTodo) {
    const inicio = (app.pagina - 1) * CONFIG.CLIENTES_POR_PAGINA;
    aMostrar = app.filtrados.slice(inicio, inicio + CONFIG.CLIENTES_POR_PAGINA);
  }

  $('page-info').textContent = `Hoja ${app.pagina} de ${totalPags}`;
  $('btn-prev').disabled = app.pagina === 1 || totalPags <= 1;
  $('btn-next').disabled = app.pagina === totalPags || totalPags <= 1;

  if (aMostrar.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="center" style="padding:25px;">No hay clientes que coincidan con los filtros.</td></tr>`;
    window.scrollTo(0, scrollY); return;
  }

  const fragment = document.createDocumentFragment();
  aMostrar.forEach(c => {
    const tr = document.createElement('tr');
    tr.classList.add(`fila-${c.estado}`);
    
    tr.innerHTML = `
      <td><strong>${c.id}. ${escapeHtml(c.nombre)}</strong></td>
      <td><input type="text" class="phone-input" value="${escapeHtml(c.telefono)}" onchange="actualizarTelefono(${c.id}, this.value)"></td>
      <td class="center">
        <select class="metodo-select ${METODOS[c.metodo].clase}" onchange="cambiarMetodo(${c.id}, this.value)">
          ${Object.entries(METODOS).map(([v, d]) => `<option value="${v}">${d.label || '&nbsp;'}</option>`).join('')}
        </select>
      </td>
      <td class="center">
        <select class="estado-select ${ESTADOS[c.estado].clase}" onchange="cambiarEstado(${c.id}, this.value)">
          ${Object.entries(ESTADOS).map(([v, d]) => `<option value="${v}">${d.label}</option>`).join('')}
        </select>
      </td>
      <td class="center">
        <select class="razon-select ${RAZONES_RETIRO[c.razonRetiro]?.clase || 'razon-ninguna'}" onchange="cambiarRazonRetiro(${c.id}, this.value)">
          ${Object.entries(RAZONES_RETIRO).map(([v, d]) => `<option value="${v}">${d.label || '&nbsp;'}</option>`).join('')}
        </select>
      </td>
      <td class="center no-print"><button class="btn-delete" onclick="eliminarCliente(${c.id})">Eliminar</button></td>
    `;
    
    tr.querySelector('.metodo-select').value = c.metodo;
    tr.querySelector('.estado-select').value = c.estado;
    tr.querySelector('.razon-select').value = c.razonRetiro || 'ninguna';
    
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);
  window.scrollTo(0, scrollY);
}

/* ================================================================
   6. DASHBOARD Y GRÁFICOS INTERACTIVOS
   ================================================================ */
let chartMetodos, chartEstados, chartTopEstados, chartRazones, chartEmbudo;

function actualizarDashboard() {
  // --- CÁLCULO DE NUEVOS KPIs ---
  const total = app.clientes.length;
  const contactados = app.clientes.filter(c => c.metodo !== 'sin_contacto').length;
  const noContactados = total - contactados;
  const dijoSi = app.clientes.filter(c => c.estado === 'dijo_que_si').length;
  const confirmados = app.clientes.filter(c => c.estado === 'confirmado').length;

  const pctContactados = total > 0 ? Math.round((contactados / total) * 100) : 0;
  const pctNoContactados = total > 0 ? Math.round((noContactados / total) * 100) : 0;
  const pctConfirmados = total > 0 ? Math.round((confirmados / total) * 100) : 0;
  const tasaExito = total > 0 ? Math.round((confirmados / total) * 100) : 0;

  // Renderizar en HTML
  if ($('kpi-total')) $('kpi-total').textContent = total;
  if ($('kpi-contactados')) $('kpi-contactados').textContent = contactados;
  if ($('kpi-contactados-pct')) $('kpi-contactados-pct').textContent = `${pctContactados}% del total`;
  if ($('kpi-no-contactados')) $('kpi-no-contactados').textContent = noContactados;
  if ($('kpi-no-contactados-pct')) $('kpi-no-contactados-pct').textContent = `${pctNoContactados}% del total`;
  if ($('kpi-dijo-si')) $('kpi-dijo-si').textContent = dijoSi;
  if ($('kpi-confirmados')) $('kpi-confirmados').textContent = confirmados;
  if ($('kpi-confirmados-pct')) $('kpi-confirmados-pct').textContent = `${pctConfirmados}% del total`;
  if ($('kpi-exito')) $('kpi-exito').textContent = `${tasaExito}%`;
  
  if ($('kpi-total-progress')) {
    $('kpi-total-progress').style.width = `${pctContactados}%`;
    $('kpi-total-progress').style.backgroundColor = pctContactados > 50 ? 'var(--success)' : 'var(--info)';
  }

  // --- GRÁFICO DE MÉTODOS ---
  const countMetodo = (m) => app.clientes.filter(c => c.metodo === m).length;
  const dataMetodos = [ countMetodo('sin_contacto'), countMetodo('llamada'), countMetodo('escrito'), countMetodo('ambos') ];
  const coloresMetodos = ['#e2e8f0', '#3a7ca5', '#8c2a41', '#d4a373'];
  const labelsMetodos = ['Sin Contacto', 'Llamada', 'Escrito', 'Ambos'];
  const keysMetodos = ['sin_contacto', 'llamada', 'escrito', 'ambos'];

  if (chartMetodos) {
    chartMetodos.data.datasets[0].data = dataMetodos;
    chartMetodos.update();
  } else {
    const ctx = document.getElementById('chart-metodos')?.getContext('2d');
    if (ctx) {
      chartMetodos = new Chart(ctx, {
        type: 'bar',
        data: { labels: labelsMetodos, datasets: [{ label: 'Clientes', data: dataMetodos, backgroundColor: coloresMetodos, borderRadius: 4 }] },
        options: { 
          responsive: true, maintainAspectRatio: false, 
          plugins: { legend: { display: false } }, 
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
          onClick: (e, activeEls) => {
            if (activeEls.length > 0) {
              const index = activeEls[0].index;
              cambiarFiltroMetodo(keysMetodos[index]);
              $('filtro-metodo').value = keysMetodos[index];
              showToast(`Filtrado por: ${labelsMetodos[index]}`, 'info');
            }
          },
          onHover: (event, chartElement) => {
            event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
          }
        }
      });
    }
  }

  // --- GRÁFICO DE ESTADOS (DONA) ---
  const countEstado = (e) => app.clientes.filter(c => c.estado === e).length;
  const labelsEstados = Object.values(ESTADOS).map(e => e.label);
  const dataEstados = Object.keys(ESTADOS).map(k => countEstado(k));
  const coloresEstados = Object.values(ESTADOS).map(e => e.color);
  const keysEstados = Object.keys(ESTADOS);

  if (chartEstados) {
    chartEstados.data.datasets[0].data = dataEstados;
    chartEstados.update();
  } else {
    const ctx = document.getElementById('chart-estados')?.getContext('2d');
    if (ctx) {
      chartEstados = new Chart(ctx, {
        type: 'doughnut',
        data: { 
          labels: labelsEstados, 
          datasets: [{ 
            data: dataEstados, 
            backgroundColor: coloresEstados, 
            borderWidth: 1,
            hoverOffset: 15,
            hoverBorderColor: '#6b1d2f',
            hoverBorderWidth: 2
          }] 
        },
        options: { 
          responsive: true, maintainAspectRatio: false, 
          animation: { animateScale: true, animateRotate: true },
          plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } },
          onClick: (e, activeEls) => {
            if (activeEls.length > 0) {
              const index = activeEls[0].index;
              filtrarPorPestana(keysEstados[index]);
              showToast(`Filtrado por: ${labelsEstados[index]}`, 'info');
            }
          },
          onHover: (event, chartElement) => {
            event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
          }
        }
      });
    }
  }

  // --- GRÁFICO TOP ESTADOS ---
  const estadosOrdenados = Object.entries(ESTADOS).map(([key, def]) => {
    return { key, label: def.label, count: countEstado(key), color: def.color };
  }).sort((a, b) => b.count - a.count).slice(0, 4);

  const labelsTop = estadosOrdenados.map(e => e.label);
  const dataTop = estadosOrdenados.map(e => e.count);
  const coloresTop = estadosOrdenados.map(e => e.color);
  const keysTop = estadosOrdenados.map(e => e.key);

  if (chartTopEstados) {
    chartTopEstados.data.labels = labelsTop;
    chartTopEstados.data.datasets[0].data = dataTop;
    chartTopEstados.data.datasets[0].backgroundColor = coloresTop;
    chartTopEstados.update();
  } else {
    const ctx = document.getElementById('chart-top-estados')?.getContext('2d');
    if (ctx) {
      chartTopEstados = new Chart(ctx, {
        type: 'bar',
        data: { labels: labelsTop, datasets: [{ data: dataTop, backgroundColor: coloresTop, borderRadius: 4 }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
          onClick: (e, activeEls) => {
            if (activeEls.length > 0) {
              const index = activeEls[0].index;
              filtrarPorPestana(keysTop[index]);
              showToast(`Filtrado por: ${labelsTop[index]}`, 'info');
            }
          },
          onHover: (event, chartElement) => {
            event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
          }
        }
      });
    }
  }

  // --- NUEVO GRÁFICO: RAZONES DE RETIRO ---
  const countRazon = (r) => app.clientes.filter(c => c.razonRetiro === r).length;
  const labelsRazones = Object.values(RAZONES_RETIRO).filter(r => r.label !== '').map(r => r.label);
  const keysRazones = Object.keys(RAZONES_RETIRO).filter(k => k !== 'ninguna');
  const dataRazones = keysRazones.map(k => countRazon(k));
  const coloresRazones = ['#4b5563', '#b91c1c', '#c2410c', '#a21caf'];

  if (chartRazones) {
    chartRazones.data.datasets[0].data = dataRazones;
    chartRazones.update();
  } else {
    const ctx = document.getElementById('chart-razones')?.getContext('2d');
    if (ctx) {
      chartRazones = new Chart(ctx, {
        type: 'bar',
        data: { labels: labelsRazones, datasets: [{ data: dataRazones, backgroundColor: coloresRazones, borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    }
  }

  // --- NUEVO GRÁFICO: EMBUDO DE CONVERSIÓN ---
  const dataEmbudo = [
    total,
    contactados,
    dijoSi,
    confirmados
  ];
  const labelsEmbudo = ['Total Base', 'Contactados', 'Dijeron que Sí', 'Confirmados'];
  const coloresEmbudo = ['#cbd5e1', '#3a7ca5', '#d4a373', '#15803d'];

  if (chartEmbudo) {
    chartEmbudo.data.datasets[0].data = dataEmbudo;
    chartEmbudo.update();
  } else {
    const ctx = document.getElementById('chart-embudo')?.getContext('2d');
    if (ctx) {
      chartEmbudo = new Chart(ctx, {
        type: 'bar',
        data: { 
          labels: labelsEmbudo, 
          datasets: [{ 
            label: 'Clientes', 
            data: dataEmbudo, 
            backgroundColor: coloresEmbudo, 
            borderRadius: 4 
          }] 
        },
        options: {
          indexAxis: 'y', // Barras horizontales para efecto embudo
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
      });
    }
  }
}

/* ================================================================
   7. ACCIONES SOBRE CLIENTES
   ================================================================ */
window.actualizarTelefono = function (id, tel) {
  const c = app.clientes.find(x => x.id === id);
  if (c) { c.telefono = String(tel).trim(); guardar(); }
};

window.cambiarMetodo = function (id, met) {
  const c = app.clientes.find(x => x.id === id);
  if (c) { 
    // Lógica Opción A: Si ya se le escribió y se cambia a llamada, pasa a ambos
    if (c.metodo === 'llamada' && met === 'escrito') c.metodo = 'ambos';
    else if (c.metodo === 'escrito' && met === 'llamada') c.metodo = 'ambos';
    else c.metodo = met; 
    guardar(); aplicarFiltros(); 
  }
};

window.cambiarEstado = function (id, est) {
  const c = app.clientes.find(x => x.id === id);
  if (c) { 
    c.estado = est; 
    // Lógica Opción A: Si el estado es de escritura pero el método era llamada, autocorregir a ambos
    if ((est === 'se_le_escribio') && c.metodo === 'llamada') c.metodo = 'ambos';
    guardar(); aplicarFiltros(); 
  }
};

window.cambiarRazonRetiro = function (id, razon) {
  const c = app.clientes.find(x => x.id === id);
  if (c) { c.razonRetiro = razon; guardar(); renderizarTabla(); }
};

window.eliminarCliente = async function (id) {
  const c = app.clientes.find(x => x.id === id);
  if (!c) return;
  if (await showConfirm(`¿Eliminar a <strong>${escapeHtml(c.nombre)}</strong>?`)) {
    app.clientes = app.clientes.filter(x => x.id !== id);
    guardar(); aplicarFiltros(); showToast('Cliente eliminado', 'success');
  }
};

/* ================================================================
   8. ALTA, PESTAÑAS Y PAGINACIÓN
   ================================================================ */
$('client-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const nombre = $('client-name').value.trim();
  const tel = $('client-phone').value.trim();
  if (!nombre || !tel) return;
  if (app.clientes.some(c => c.nombre.trim().toUpperCase() === nombre.toUpperCase())) {
    showToast('El cliente ya existe', 'warning'); return;
  }
  const nuevoId = app.clientes.length > 0 ? Math.max(...app.clientes.map(c => c.id)) + 1 : 1;
  app.clientes.push({ id: nuevoId, nombre, telefono: tel, metodo: 'sin_contacto', estado: 'pendiente', razonRetiro: 'ninguna' });
  guardar();
  
  app.pestana = 'todos';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'todos'));
  $('search-input').value = '';
  app.busqueda = '';
  aplicarFiltros();
  
  const totalPags = Math.ceil(app.filtrados.length / CONFIG.CLIENTES_POR_PAGINA);
  app.pagina = totalPags;
  renderizarTabla();

  $('client-name').value = ''; $('client-phone').value = ''; $('client-name').focus();
  showToast('Cliente agregado', 'success');
});

// Pestañas principales (Tabla)
$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  app.pestana = btn.dataset.tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  aplicarFiltros();
});

// NUEVO: Pestañas internas del Dashboard
$('dash-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.dash-tab');
  if (!btn) return;
  
  const target = btn.dataset.dash;
  app.dashTab = target;
  
  // Cambiar clases activas de las pestañas
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  
  // Cambiar visibilidad de las vistas con animación
  document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById(`dash-${target}`);
  if (targetView) {
    targetView.classList.add('active');
  }
});

window.cambiarPagina = function (dir) {
  const totalPags = Math.max(1, Math.ceil(app.filtrados.length / CONFIG.CLIENTES_POR_PAGINA));
  const nueva = app.pagina + dir;
  if (nueva >= 1 && nueva <= totalPags) { app.pagina = nueva; renderizarTabla(); }
};

/* ================================================================
   9. RESPALDO E IMPRESIÓN
   ================================================================ */
window.exportarRespaldo = function () {
  const blob = new Blob([JSON.stringify(app.clientes, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `respaldo_${new Date().toISOString().slice(0,10)}.json`; a.click();
  showToast('Respaldo JSON guardado', 'success');
};

window.exportarCSV = function () {
  const rows = [['ID', 'Nombre', 'Teléfono', 'Método', 'Estado', 'Razón de Retiro']];
  app.clientes.forEach(c => {
    const razon = RAZONES_RETIRO[c.razonRetiro]?.label || c.razonRetiro || 'Ninguna';
    rows.push([c.id, `"${c.nombre}"`, `"${c.telefono}"`, METODOS[c.metodo].label, ESTADOS[c.estado].label, razon]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `clientes_lista_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  showToast('Lista exportada a CSV', 'success');
};

window.exportarEstadisticasExcel = function () {
  const total = app.clientes.length;
  if (total === 0) { showToast('No hay datos para exportar', 'warning'); return; }

  const countEstado = (e) => app.clientes.filter(c => c.estado === e).length;
  const countMetodo = (m) => app.clientes.filter(c => c.metodo === m).length;
  const contactados = app.clientes.filter(c => c.metodo !== 'sin_contacto').length;
  const noContactados = total - contactados;
  
  const confirmados = countEstado('confirmado');
  const dijoSi = countEstado('dijo_que_si');
  const tasaExito = total > 0 ? Math.round((confirmados / total) * 100) : 0;

  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <style>
        table { border-collapse: collapse; font-family: Arial, sans-serif; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background-color: #6b1d2f; color: white; font-weight: bold; }
        .section-title { background-color: #f5efe6; font-weight: bold; font-size: 14px; color: #6b1d2f; }
      </style>
    </head>
    <body>
      <h2>Reporte de Estadísticas - Seguimiento de Clientes</h2>
      <p>Fecha de exportación: ${new Date().toLocaleString()}</p>
      
      <table>
        <tr><th colspan="3" class="section-title">1. Resumen General (KPIs)</th></tr>
        <tr><th>Métrica</th><th>Cantidad</th><th>Porcentaje</th></tr>
        <tr><td>Total Clientes</td><td>${total}</td><td>100%</td></tr>
        <tr><td>Contactados</td><td>${contactados}</td><td>${Math.round((contactados/total)*100)}%</td></tr>
        <tr><td>No Contactados</td><td>${noContactados}</td><td>${Math.round((noContactados/total)*100)}%</td></tr>
        <tr><td>Dijeron que Sí (Temporal)</td><td>${dijoSi}</td><td>${Math.round((dijoSi/total)*100)}%</td></tr>
        <tr><td>Confirmados</td><td>${confirmados}</td><td>${Math.round((confirmados/total)*100)}%</td></tr>
        <tr><td><strong>Tasa de Éxito (Solo Confirmados)</strong></td><td><strong>${tasaExito}%</strong></td><td>-</td></tr>
        
        <tr><th colspan="3" class="section-title">2. Métodos de Contacto</th></tr>
        <tr><th>Método</th><th>Cantidad</th><th>Porcentaje</th></tr>
        <tr><td>Sin Contacto</td><td>${countMetodo('sin_contacto')}</td><td>${Math.round((countMetodo('sin_contacto')/total)*100)}%</td></tr>
        <tr><td>Llamada</td><td>${countMetodo('llamada')}</td><td>${Math.round((countMetodo('llamada')/total)*100)}%</td></tr>
        <tr><td>Escrito</td><td>${countMetodo('escrito')}</td><td>${Math.round((countMetodo('escrito')/total)*100)}%</td></tr>
        <tr><td>Ambos (Llamada y Escrito)</td><td>${countMetodo('ambos')}</td><td>${Math.round((countMetodo('ambos')/total)*100)}%</td></tr>

        <tr><th colspan="3" class="section-title">3. Distribución de Estados</th></tr>
        <tr><th>Estado</th><th>Cantidad</th><th>Porcentaje</th></tr>
        <tr><td>Pendiente</td><td>${countEstado('pendiente')}</td><td>${Math.round((countEstado('pendiente')/total)*100)}%</td></tr>
        <tr><td>Se le escribió</td><td>${countEstado('se_le_escribio')}</td><td>${Math.round((countEstado('se_le_escribio')/total)*100)}%</td></tr>
        <tr><td>No respondió</td><td>${countEstado('no_respondio')}</td><td>${Math.round((countEstado('no_respondio')/total)*100)}%</td></tr>
        <tr><td>Posiblemente</td><td>${countEstado('posiblemente')}</td><td>${Math.round((countEstado('posiblemente')/total)*100)}%</td></tr>
        <tr><td>Dijo que sí</td><td>${countEstado('dijo_que_si')}</td><td>${Math.round((countEstado('dijo_que_si')/total)*100)}%</td></tr>
        <tr><td>Dijo que no</td><td>${countEstado('dijo_que_no')}</td><td>${Math.round((countEstado('dijo_que_no')/total)*100)}%</td></tr>
        <tr><td>No contactado</td><td>${countEstado('no_contactado')}</td><td>${Math.round((countEstado('no_contactado')/total)*100)}%</td></tr>
        <tr><td>Confirmado</td><td>${countEstado('confirmado')}</td><td>${Math.round((countEstado('confirmado')/total)*100)}%</td></tr>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Estadisticas_Clientes_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Estadísticas exportadas a Excel', 'success');
};

window.importarRespaldo = function (e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (Array.isArray(data) && await showConfirm(`Reemplazar con ${data.length} registros?`)) {
        app.clientes = data.map((c, i) => {
          const mig = migrarCliente(c);
          return { id: c.id || i+1, nombre: c.nombre, telefono: c.telefono, metodo: mig.metodo, estado: mig.estado, razonRetiro: mig.razonRetiro };
        });
        guardar(); aplicarFiltros(); showToast('Respaldo restaurado', 'success');
      }
    } catch { showToast('Error de archivo', 'error'); }
  };
  reader.readAsText(file);
  e.target.value = '';
};

window.imprimirPaginaActual = () => { app.modoImprimirTodo = false; renderizarTabla(); window.print(); };
window.imprimirTodo = () => { app.modoImprimirTodo = true; renderizarTabla(); window.print(); app.modoImprimirTodo = false; renderizarTabla(); };

window.filtrarClientes = () => buscarDebounced();

/* ================================================================
   10. ATAJOS DE TECLADO
   ================================================================ */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault(); $('search-input')?.focus();
  }
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    e.preventDefault(); $('search-input')?.focus();
  }
});

/* ================================================================
   11. ARRANQUE
   ================================================================ */
(function init() {
  app.clientes = inicializarClientes();
  guardar();
  aplicarFiltros();
})();