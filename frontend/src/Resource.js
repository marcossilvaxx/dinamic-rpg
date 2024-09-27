class Resource {
  constructor() {
    this.toLoad = {
      shadow: "/sprites/shadow.png",
      map: "/sprites/map.png",
      foreground: "/sprites/foreground-map.png",
      warriorM: "/sprites/characters/warrior_m.png",
      warriorF: "/sprites/characters/warrior_f.png",
      mageM: "/sprites/characters/mage_m.png",
      mageF: "/sprites/characters/mage_f.png",
      ninjaM: "/sprites/characters/ninja_m.png",
      ninjaF: "/sprites/characters/ninja_f.png",
      townfolkM: "/sprites/characters/townfolk_m.png",
      townfolkF: "/sprites/characters/townfolk_f.png",
      healerM: "/sprites/characters/healer_m.png",
      healerF: "/sprites/characters/healer_f.png",
      rangerM: "/sprites/characters/ranger_m.png",
      rangerF: "/sprites/characters/ranger_f.png",
    };

    this.images = {};

    Object.keys(this.toLoad).forEach((key) => {
      const img = new Image();
      img.src = this.toLoad[key];

      this.images[key] = {
        image: img,
        isLoaded: false,
      };

      img.onload = () => {
        this.images[key].isLoaded = true;
      };
    });
  }
}

export const resources = new Resource();
