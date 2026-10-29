interface PhotoCredit {
  file: string;
  usage: string;
  creator: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
}

const PEXELS_LICENSE = "https://www.pexels.com/license/";
const CC_BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/";

function pexels(file: string, photo: string, usage: string): PhotoCredit {
  return {
    file,
    usage,
    creator: `Pexels photo ${photo}`,
    sourceUrl: `https://www.pexels.com/photo/${photo}/`,
    license: "Pexels License",
    licenseUrl: PEXELS_LICENSE,
  };
}

/**
 * Every photograph bundled in `public/media`, with the page it appears on.
 * The in-app credits page and the README appendix read from this list.
 */
export const OPEN_SOURCE_CREDITS: { photos: PhotoCredit[] } = {
  photos: [
    pexels(
      "hero-community.jpg",
      "6646918",
      "Mission Control hero, welcome and organization gallery, kiosk backdrop",
    ),
    pexels(
      "opp-food-distribution.jpg",
      "6646918",
      "Food distribution cards, check-in backdrop, organization gallery",
    ),
    pexels("community-strip-1.jpg", "6646918", "Mission Control community photo strip"),
    pexels("opp-pantry.jpg", "6646862", "Pantry setup cards and attendance fallback"),
    pexels(
      "opp-community-garden.jpg",
      "39779034",
      "Community garden cards, organization gallery, mission-control strip",
    ),
    pexels("community-strip-3.jpg", "39779034", "Mission Control community photo strip"),
    pexels(
      "opp-library-tutoring.jpg",
      "8342411",
      "Library tutoring cards, discovery results, mission-control strip",
    ),
    pexels("community-strip-2.jpg", "8342411", "Mission Control community photo strip"),
    pexels("opp-park-cleanup.jpg", "39037905", "Park cleanup opportunity card"),
    pexels("opp-animal-shelter.jpg", "35231854", "Animal shelter opportunity card"),
    pexels("opp-senior-meals.jpg", "6647037", "Senior meal delivery opportunity card"),
    pexels("welcome-volunteer.jpg", "6646930", "Welcome screen and volunteer detail hero"),
    pexels("signin-volunteers.jpg", "6995298", "Sign-in screen"),
    {
      file: "opp-community-event.jpg",
      usage: "Neighborhood mural cards, impact stories, organization gallery",
      creator: "Irvin Parco Sto. Tomas, Wikimedia Commons",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/File:Wiki_Loves_Arts_mural_painting_at_Manapao_Elementary_School_05.jpg",
      license: "CC BY-SA 4.0",
      licenseUrl: CC_BY_SA,
    },
    {
      file: "buffalo-skyline.jpg",
      usage: "Report cover and personal impact hero",
      creator: "Peter S, Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Buffalo_skyline_2014.jpg",
      license: "CC BY-SA 4.0",
      licenseUrl: CC_BY_SA,
    },
    pexels(
      "volunteers/olive-carter.jpg",
      "40062802",
      "AutoRoster volunteer portrait for Olive Carter",
    ),
    pexels(
      "volunteers/rafael-martin.jpg",
      "13120070",
      "AutoRoster volunteer portrait for Rafael Martin",
    ),
    pexels(
      "volunteers/jasmine-bennett.jpg",
      "6976400",
      "AutoRoster volunteer portrait for Jasmine Bennett",
    ),
    pexels(
      "volunteers/diego-weber.jpg",
      "19285927",
      "AutoRoster volunteer portrait for Diego Weber",
    ),
    pexels(
      "volunteers/nico-carter.jpg",
      "8151688",
      "AutoRoster volunteer portrait for Nico Carter",
    ),
    pexels(
      "volunteers/gloria-weber.jpg",
      "30004320",
      "AutoRoster volunteer portrait for Gloria Weber",
    ),
  ],
};
