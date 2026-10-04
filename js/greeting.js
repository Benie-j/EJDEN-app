// src/greeting.ts
// Salutation selon l'heure exacte (heure locale de l'appareil) :
//   05h00 – 11h59  : Bonjour
//   12h00 – 17h59  : Bon après-midi
//   18h00 – 04h59  : Bonsoir
export function greetingFor(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) {
        return "Bonjour";
    }
    if (hour >= 12 && hour < 18) {
        return "Bon après-midi";
    }
    return "Bonsoir";
}
//# sourceMappingURL=greeting.js.map