# Datos del mapa

El motor acepta cualquier mapa que construya un `CityGraph` con nodos y calles.
El archivo de mapa de producción debe generarse desde una exportación validada
de OpenStreetMap de Manta y conservar este contrato:

```json
{
  "nodos": [{"id": "N-0001", "lat": -0.95, "lng": -80.72}],
  "calles": [
    {
      "origen": "N-0001",
      "destino": "N-0002",
      "distancia_m": 120,
      "tipo": "calle"
    }
  ]
}
```

La cuadrícula de 25 nodos usada por esta primera versión es un fixture de
desarrollo, no una afirmación de que represente las calles reales de Manta.
`GET /mapa` expone el mismo formato para que el frontend pueda consumirlo.
