# OPERACION 9 DIAS

Prototipo jugable en navegador de un hibrido **4X + RTS + city builder**, con
partidas de exactamente **9 dias** y **metaprogresion persistente**.

> "La ciudad es tu progreso permanente, pero la partida es el motor que hace
> crecer la ciudad."

## Arranque rapido

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 66 tests de logica de juego
npm run sim          # simula una partida completa en consola
npm run sim -- 1000 40   # 40 partidas: informe de balance
npm run build        # bundle de produccion
npm run build:single # un unico HTML autocontenido, sin peticiones externas
```

`build:single` produce `dist-single/operacion-9-dias.html`: el juego entero en un
fichero de ~780 kB que corre desde `file://`, desde cualquier hosting estatico o
dentro de un sandbox que bloquee peticiones externas. La ciudad se guarda en
`localStorage`, asi que la metaprogresion sobrevive a recargar la pagina.

## El mapa

Tres zonas concentricas separadas por **muros que nada cruza** - ni terrestre,
ni naval, ni aereo. La unica apertura es una **puerta**, y las puertas se abren
en un dia fijo, igual para todos. Eso convierte los nueve dias en tres actos:

```
        ZONA 1 - PERIFERIA          5 sectores amurallados, un spawn cada uno
        recursos comunes            dias 1-2: desarrollas solo, sin contacto
              |
          [ PUERTA ]                se abre el DIA 3
              |
        ZONA 2 - CINTURON           3 sectores disputados
        comunes muy abundantes      dias 3-5: primer conflicto real
        raros escasos               objetivos con guarnicion -> items y buffos
              |
          [ PUERTA ]                se abre el DIA 6
              |
        ZONA 3 - NUCLEO             recursos raros abundantes
        Mando Central               dias 6-9: carrera por el item legendario
```

Reparto de contenido, exactamente como esta briefeado:

| Zona | Comun | Raro | Otros |
| --- | --- | --- | --- |
| 1 | abundante | ninguno | - |
| 2 | muy abundante | escaso | 1 objetivo con guarnicion por sector, 1 instalacion |
| 3 | - | abundante + una veta fina | Mando Central: conquistalo y te llevas el Nucleo del Elemento X |

Los sectores de una misma zona tambien estan amurallados entre si y **no** tienen
puertas: todo el mundo se ve empujado hacia dentro. El nucleo acaba siendo el
unico nodo que conecta los tres sectores del cinturon.

## El loop

```
Ciudad -> Matchmaking -> Partida de 9 dias -> Exploracion -> Explotacion
   ^                                                              |
   |                                                        Construccion
   |                                                        Investigacion
   |                                                          Ejercito
   |                                                          Conflicto
   |                                                          Objetivo
   +---------------- Recompensas <-------------------------------+
```

Cada partida son 5 participantes (1 humano + 4 bots), 1 mapa hexagonal por
semilla, 1 objetivo principal y 3 secundarios. Los turnos son instantaneos: no
hay esperas de 24 h. Una partida completa se juega en menos de un minuto con
`AUTO-SIM`, o a mano con `DIA SIGUIENTE`.

## Arquitectura

La regla que ordena todo el proyecto: **el estado de juego se ejecuta sin
renderizar**. `/core`, `/map`, `/ai`, `/entities` y `/data` no importan ni React
ni Three.js. Eso es lo que hace posibles mas adelante un servidor autoritativo,
multijugador real, replays y los tests que ya existen.

```
src/
  core/        gameState, turnSystem, actions, combat, movement, economy,
               resources, technology, construction, objectives, territory,
               scoring, rewards, events, rng
  entities/    city (metaprogresion persistente)
  map/         hex (axial pointy-top), mapGeneration, fogOfWar
  ai/          botController, strategies, decisionSystem
  data/        troops, buildings.city, buildings.map, technologies,
               commanders, resources, terrain, objectives, balance
  rendering/   sceneKit, mapRenderer, cityRenderer, palette   (Three.js)
  ui/          store (zustand), screens/, components/          (React)
  sim/         simulateMatch (headless)
```

Direccion de dependencias: `ui -> rendering -> core -> data`. Nunca al reves.

### Una sola superficie de acciones

Tanto la UI humana como los bots pasan por `core/actions.ts` y por nada mas
(`moveArmy`, `attack`, `buildAt`, `researchTechnology`, `trainTroops`,
`captureGate`, `activateFacility`, ...). Sustituir un bot por un jugador de red
sera enrutar comandos desde otro sitio, no reescribir la partida.

### Datos configurables

Nada de balance esta incrustado en los sistemas. Tropas, edificios,
tecnologias, comandantes, terrenos y objetivos son tablas en `/data`, y
`data/balance.ts` concentra las constantes que un disenador querra tocar.

## Sistemas implementados

| Sistema | Estado |
| --- | --- |
| Mapa de 3 zonas con muros infranqueables y puertas con horario | Completo |
| Objetivos con guarnicion que sueltan items y buffos de partida | Completo |
| 12 comandantes en 4 mecanicas: asalto, recoleccion, construccion, exploracion | Completo |
| Ordenes con seleccion: que unidades mueves, con que comandante atacas | Completo |
| Modelos 3D por tipo de unidad (infanteria, blindado, artilleria, naval, aereo) | Completo |
| Fog of war de 3 niveles (oculto / recordado / visible) con sombra de terreno | Completo |
| Economia doble: recursos de partida frente a recursos de ciudad | Completo |
| Ciudadanos como recurso estrategico limitado | Completo |
| Recursos raros escasos (titanio, uranio, cristal) como cuello de botella | Completo |
| Construccion en hexagonos (14 edificios de mapa, niveles, upkeep) | Completo |
| Movimiento por terreno, carreteras, dominios tierra/agua/aire | Completo |
| Combate determinista (terreno, comandante, tecnologia, contras, municion) | Completo |
| Arbol tecnologico de 16 nodos en partida | Completo |
| 10 tropas en 3 dominios con evolucion individual por linea | Completo |
| 6 comandantes con especialidad, habilidad y nivel persistente | Completo |
| Ejercitos multiples, division, fusion, plazas limitadas | Completo |
| Objetivos: 3 principales rotativos + 3 secundarios | Completo |
| Ciudad persistente: 8 edificios en 3 ramas, guardado en localStorage | Completo |
| Recompensas de fin de partida que alimentan la ciudad | Completo |
| 4 bots con personalidad sobre utility scoring | Completo |
| Simulador headless + arnes CLI de balance | Completo |
| Panel de debug (F1) | Completo |

## Como la ciudad cambia la partida

`entities/city.ts` -> `deriveCityEffects()` -> `core/gameState.ts` ->
`buildHumanLoadout()`. Ese es el unico canal. La ciudad decide:

- nivel tecnologico (que tropas, edificios y tecnologias existen);
- ciudadanos, recursos iniciales y techo de almacenamiento;
- plazas de ejercito y de comandante;
- techo de nivel de tropa (la Academia);
- multiplicadores de produccion, ciencia, ataque, defensa y recompensas;
- inteligencia inicial sobre rivales y presion diplomatica sobre los bots.

Los bots escalan con el nivel de la ciudad del jugador, asi que progresar no
convierte las partidas en un paseo.

## Balance actual

Dos barridos independientes de 40 partidas (`npm run sim -- <semilla> 40`):

```
semillas 1000-1039   humano(auto) 13 · diplomatic 10 · economic 8 · explorer 7 · military 2
                     objetivo 19 (48%) · puntuacion 21 (52%) · 8.18 dias de media

semillas 7000-7039   diplomatic 11 · explorer 10 · humano(auto) 7 · military 7 · economic 5
                     objetivo 14 (35%) · puntuacion 26 (65%) · 8.38 dias de media
```

Lo que dicen estos numeros:

- **Los cinco perfiles ganan partidas** y el reparto cambia entre barridos: no
  hay una estrategia unica dominante.
- **El objetivo principal se consigue entre un 35% y un 48% de las veces.** El
  nucleo es alcanzable pero disputado, que es lo que se buscaba.
- **El rediseno del mapa arreglo el sesgo diplomatico** que tenia la version
  anterior (ganaba un 36%). Con muros y puertas con horario, evitar el combate
  ya no es una estrategia dominante: el cinturon hay que cruzarlo.
- **Hallazgo pendiente: el perfil militar es el mas irregular** (2 victorias en
  un barrido, 7 en el otro). Depende demasiado de que su sector toque un
  cinturon rico. Es el siguiente numero que tocaria.

No es un balance final. Es un espacio de decisiones vivo y un arnes que permite
medirlo en segundos.

## Controles

**Escritorio**: raton (boton izquierdo arrastra = pan, derecho = rotar, rueda =
zoom), `F1` panel de debug, `Espacio` avanzar dia.

**Ordenes**: `MOVER` abre un selector para elegir **que unidades** se mueven (si
eliges solo una parte, se separa un destacamento). `ATACAR` abre un selector
para elegir **con que comandante** atacas, agrupados por mecanica; si ese
comandante estaba en otro ejercito, se reasigna solo.

**Movil / tactil**: un dedo arrastra = pan, dos dedos = zoom y rotacion, toque =
seleccion. Ninguna interaccion depende de `hover`, todos los objetivos tactiles
son de 44 px o mas, y la UI se reordena en pantallas estrechas y en horizontal.

Flujo de accion pensado para el pulgar: elige el verbo abajo (`MOVER`,
`ATACAR`...) y despues toca el hexagono destino. No hay gestos de arrastre.

## Estado del prototipo: criterios cumplidos

Entrar en la ciudad, ver y mejorar edificios, entrar en matchmaking, jugar
contra 4 bots en un mapa 3D, explorar, mover ejercitos, conseguir recursos,
construir en hexagonos, investigar, crear tropas, asignar comandantes, atacar,
capturar territorios, conseguir recursos raros, abrir regiones por puertas,
competir por el objetivo central, llegar al dia 9, ganar o perder, recibir
recompensas, volver a la ciudad y notar la progresion en la siguiente partida.

## Pendiente

Fuera del alcance de este vertical slice, por orden de prioridad sugerido:

1. **Multijugador**: el core ya es headless y determinista; falta extraer un
   servidor autoritativo que valide las mismas llamadas de `core/actions.ts`.
2. **Combate visual**: hoy el combate es una resolucion instantanea con parte
   escrito. El sistema estrategico esta cerrado; falta la representacion.
3. **Unidades navales en la practica**: existen, pero la generacion de mapa
   produce poca agua conectada; hay que generar mares utiles.
4. **Marcha multi-dia real**: `moveTowards` avanza cada dia hacia el destino,
   pero no hay ordenes persistentes entre dias.
5. **Modelos de unidad**: son primitivas procedurales, no assets. La silueta
   distingue infanteria de blindado, artilleria, naval y aereo, que es lo que
   hace falta para jugar, pero no es arte final.
6. **PWA / empaquetado movil**: el stack ya es compatible (Vite + WebGL, sin
   dependencias de escritorio); falta manifest, service worker y capa tactil
   pulida.
7. **Audio, particulas y tutorial minimo**.
8. **Mas contenido**: el sistema es de tablas, asi que anadir tropas, edificios
   o tecnologias es editar `/data`.

## Decisiones tecnicas

- **Vite + TypeScript**: arranque rapido, bundle pequeno, portable a movil.
- **Three.js directo, sin react-three-fiber**: el mapa se dibuja con
  `InstancedMesh` (169 hexagonos en 3 draw calls) y el renderer tiene su propio
  bucle. React nunca entra en el frame loop. Menos bundle y separacion real
  entre logica y presentacion.
- **Zustand**: el estado de partida se muta en sitio por rendimiento y React se
  entera por un contador `tick`. Clonar 169 hexagonos por interaccion no tiene
  sentido en un juego.
- **Sin librerias de UI**: un unico `styles.css` con tokens. 9,5 kB.

Bundle de produccion: **~220 kB gzip** en total (121 kB son Three.js).
