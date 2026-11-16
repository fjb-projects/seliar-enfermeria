# Exportación de horas netas

En Coordinación → Compensatorios, selecciona **Exportar horas**. La descarga incluye
todos los agentes registrados, incluso inactivos, independientemente del agente
seleccionado en pantalla. No modifica solicitudes, liquidaciones ni saldos.

- **2024 y 2025:** saldo neto anual registrado, sin reconstruir meses inexistentes.
- **Desde 2026:** selecciona meses o **Extracto anual hasta el momento**. Este último
  incluye enero hasta el mes actual según el día de servicio de Buenos Aires. Para
  años anteriores incluye los doce meses.
- **Excel (.xlsx):** una fila por agente, una columna por mes incluido y una columna
  final con su total. Los valores son horas decimales: 1,5 equivale a 1 h 30 min.

Cada mes utiliza el neto de la liquidación activa, que ya descuenta las horas
tomadas externas y las registradas por solicitudes. No vuelve a descontarlas.
Las liquidaciones revertidas no se incluyen. El total es la suma de los meses
incluidos con datos, no el saldo acumulado ni el saldo disponible del banco.

Una celda vacía significa **sin liquidación cargada**, no cero. Un total puede ser
parcial si faltan liquidaciones. Si existen consumos de solicitudes en un mes sin
liquidar, se señalan al final del archivo y no se inventa su neto. Si falla alguna
lectura, no se descarga un archivo parcial: revisa el error y vuelve a intentarlo.

La descarga consulta el padrón y los períodos al solicitarla. Las lecturas por
agente no son un cierre contable transaccional único; evita realizar cambios
simultáneos al preparar un extracto de cierre. No incluye reimportación de Excel.
