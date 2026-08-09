// GENERATED FILE -- do not edit by hand.
// Regenerate with: node scripts/import-catalog.mjs
//
// Sample catalog imported from the public DummyJSON API at authoring time and
// committed as static data. No network call happens at runtime, so the catalog
// is deterministic, works offline, and introduces no third-party origin.
//
// These are sample products in a sandbox market, exactly like the hand-seeded
// entries they join. None of them is a real listing, merchant, or inventory
// commitment.
import type { ProductCategory } from "./types.ts";

export interface ImportedCatalogEntry {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly category: ProductCategory;
  readonly msrpUnitCents: number;
  readonly description: string;
  /** Seeded funded demand at the pool's published cutoff. */
  readonly committedUnitCount: number;
  /** Best price the merchant roster can honour at that quantity. */
  readonly estimatedUnitPriceCents: number;
  readonly economics: Readonly<
    Record<
      "merchant-keystone" | "merchant-northstar" | "merchant-signal",
      { readonly openingUnitCents: number; readonly floorUnitCents: number }
    >
  >;
}

export const IMPORTED_CATALOG_SOURCE = "dummyjson.com/products" as const;

export const IMPORTED_CATALOG: readonly ImportedCatalogEntry[] = [
  {
    "id": "product-amazon-echo-plus",
    "slug": "amazon-echo-plus",
    "name": "Echo Plus",
    "brand": "Amazon",
    "category": "audio",
    "msrpUnitCents": 9999,
    "description": "The Amazon Echo Plus is a smart speaker with built-in Alexa voice control. It features premium sound quality and serves as a hub for controlling smart home devices.",
    "committedUnitCount": 30,
    "estimatedUnitPriceCents": 8529,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 9467,
        "floorUnitCents": 8217
      },
      "merchant-northstar": {
        "openingUnitCents": 9676,
        "floorUnitCents": 8436
      },
      "merchant-signal": {
        "openingUnitCents": 9171,
        "floorUnitCents": 7971
      }
    }
  },
  {
    "id": "product-annibale-colombo-bed",
    "slug": "annibale-colombo-bed",
    "name": "Bed",
    "brand": "Annibale Colombo",
    "category": "home",
    "msrpUnitCents": 189999,
    "description": "The Annibale Colombo Bed is a luxurious and elegant bed frame, crafted with high-quality materials for a comfortable and stylish bedroom.",
    "committedUnitCount": 13,
    "estimatedUnitPriceCents": 164984,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 180974,
        "floorUnitCents": 156844
      },
      "merchant-northstar": {
        "openingUnitCents": 185173,
        "floorUnitCents": 162943
      },
      "merchant-signal": {
        "openingUnitCents": 177402,
        "floorUnitCents": 151372
      }
    }
  },
  {
    "id": "product-annibale-colombo-sofa",
    "slug": "annibale-colombo-sofa",
    "name": "Sofa",
    "brand": "Annibale Colombo",
    "category": "home",
    "msrpUnitCents": 249999,
    "description": "The Annibale Colombo Sofa is a sophisticated and comfortable seating option, featuring exquisite design and premium upholstery for your living room.",
    "committedUnitCount": 33,
    "estimatedUnitPriceCents": 213783,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 236624,
        "floorUnitCents": 205874
      },
      "merchant-northstar": {
        "openingUnitCents": 240349,
        "floorUnitCents": 212099
      },
      "merchant-signal": {
        "openingUnitCents": 229874,
        "floorUnitCents": 198874
      }
    }
  },
  {
    "id": "product-apple-airpods",
    "slug": "apple-airpods",
    "name": "Airpods",
    "brand": "Apple",
    "category": "audio",
    "msrpUnitCents": 12999,
    "description": "The Apple Airpods offer a seamless wireless audio experience. With easy pairing, high-quality sound, and Siri integration, they are perfect for on-the-go listening.",
    "committedUnitCount": 30,
    "estimatedUnitPriceCents": 11339,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 12385,
        "floorUnitCents": 10566
      },
      "merchant-northstar": {
        "openingUnitCents": 12467,
        "floorUnitCents": 11128
      },
      "merchant-signal": {
        "openingUnitCents": 12193,
        "floorUnitCents": 10295
      }
    }
  },
  {
    "id": "product-apple-airpods-max-silver",
    "slug": "apple-airpods-max-silver",
    "name": "AirPods Max Silver",
    "brand": "Apple",
    "category": "audio",
    "msrpUnitCents": 54999,
    "description": "The Apple AirPods Max in Silver are premium over-ear headphones with high-fidelity audio, adaptive EQ, and active noise cancellation. Experience immersive sound in style.",
    "committedUnitCount": 25,
    "estimatedUnitPriceCents": 47492,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 52211,
        "floorUnitCents": 44731
      },
      "merchant-northstar": {
        "openingUnitCents": 52722,
        "floorUnitCents": 46342
      },
      "merchant-signal": {
        "openingUnitCents": 51067,
        "floorUnitCents": 44082
      }
    }
  },
  {
    "id": "product-apple-airpower-wireless-charger",
    "slug": "apple-airpower-wireless-charger",
    "name": "Airpower Wireless Charger",
    "brand": "Apple",
    "category": "audio",
    "msrpUnitCents": 7999,
    "description": "The Apple AirPower Wireless Charger provides a convenient way to charge your compatible Apple devices wirelessly. Simply place your devices on the charging mat for effortless charg",
    "committedUnitCount": 11,
    "estimatedUnitPriceCents": 7038,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 7454,
        "floorUnitCents": 6494
      },
      "merchant-northstar": {
        "openingUnitCents": 7701,
        "floorUnitCents": 6757
      },
      "merchant-signal": {
        "openingUnitCents": 7331,
        "floorUnitCents": 6323
      }
    }
  },
  {
    "id": "product-apple-homepod-mini-cosmic-grey",
    "slug": "apple-homepod-mini-cosmic-grey",
    "name": "HomePod Mini Cosmic Grey",
    "brand": "Apple",
    "category": "audio",
    "msrpUnitCents": 9999,
    "description": "The Apple HomePod Mini in Cosmic Grey is a compact smart speaker that delivers impressive audio and integrates seamlessly with the Apple ecosystem for a smart home experience.",
    "committedUnitCount": 25,
    "estimatedUnitPriceCents": 8596,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 9362,
        "floorUnitCents": 8202
      },
      "merchant-northstar": {
        "openingUnitCents": 9506,
        "floorUnitCents": 8456
      },
      "merchant-signal": {
        "openingUnitCents": 9243,
        "floorUnitCents": 7973
      }
    }
  },
  {
    "id": "product-apple-macbook-pro-14-inch-space-grey",
    "slug": "apple-macbook-pro-14-inch-space-grey",
    "name": "MacBook Pro 14 Inch Space Grey",
    "brand": "Apple",
    "category": "computing",
    "msrpUnitCents": 199999,
    "description": "The MacBook Pro 14 Inch in Space Grey is a powerful and sleek laptop, featuring Apple's M1 Pro chip for exceptional performance and a stunning Retina display.",
    "committedUnitCount": 28,
    "estimatedUnitPriceCents": 173351,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 186399,
        "floorUnitCents": 162599
      },
      "merchant-northstar": {
        "openingUnitCents": 193159,
        "floorUnitCents": 168959
      },
      "merchant-signal": {
        "openingUnitCents": 186519,
        "floorUnitCents": 158119
      }
    }
  },
  {
    "id": "product-apple-magsafe-battery-pack",
    "slug": "apple-magsafe-battery-pack",
    "name": "MagSafe Battery Pack",
    "brand": "Apple",
    "category": "audio",
    "msrpUnitCents": 9999,
    "description": "The Apple MagSafe Battery Pack is a portable and convenient way to add extra battery life to your MagSafe-compatible iPhone. Attach it magnetically for a secure connection.",
    "committedUnitCount": 16,
    "estimatedUnitPriceCents": 8657,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 9309,
        "floorUnitCents": 8099
      },
      "merchant-northstar": {
        "openingUnitCents": 9719,
        "floorUnitCents": 8489
      },
      "merchant-signal": {
        "openingUnitCents": 9395,
        "floorUnitCents": 8045
      }
    }
  },
  {
    "id": "product-apple-watch-series-4-gold",
    "slug": "apple-watch-series-4-gold",
    "name": "Watch Series 4 Gold",
    "brand": "Apple",
    "category": "audio",
    "msrpUnitCents": 34999,
    "description": "The Apple Watch Series 4 in Gold is a stylish and advanced smartwatch with features like heart rate monitoring, fitness tracking, and a beautiful Retina display.",
    "committedUnitCount": 13,
    "estimatedUnitPriceCents": 30046,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 33393,
        "floorUnitCents": 28843
      },
      "merchant-northstar": {
        "openingUnitCents": 33792,
        "floorUnitCents": 30012
      },
      "merchant-signal": {
        "openingUnitCents": 32308,
        "floorUnitCents": 28038
      }
    }
  },
  {
    "id": "product-asus-zenbook-pro-dual-screen-laptop",
    "slug": "asus-zenbook-pro-dual-screen-laptop",
    "name": "Zenbook Pro Dual Screen Laptop",
    "brand": "Asus",
    "category": "computing",
    "msrpUnitCents": 179999,
    "description": "The Asus Zenbook Pro Dual Screen Laptop is a high-performance device with dual screens, providing productivity and versatility for creative professionals.",
    "committedUnitCount": 21,
    "estimatedUnitPriceCents": 155748,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 169973,
        "floorUnitCents": 148553
      },
      "merchant-northstar": {
        "openingUnitCents": 175247,
        "floorUnitCents": 154367
      },
      "merchant-signal": {
        "openingUnitCents": 167471,
        "floorUnitCents": 144611
      }
    }
  },
  {
    "id": "product-bedside-table-african-cherry",
    "slug": "bedside-table-african-cherry",
    "name": "Bedside Table African Cherry",
    "brand": "Furniture Co.",
    "category": "home",
    "msrpUnitCents": 29999,
    "description": "The Bedside Table in African Cherry is a stylish and functional addition to your bedroom, providing convenient storage space and a touch of elegance.",
    "committedUnitCount": 35,
    "estimatedUnitPriceCents": 26155,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 28376,
        "floorUnitCents": 24686
      },
      "merchant-northstar": {
        "openingUnitCents": 28652,
        "floorUnitCents": 25382
      },
      "merchant-signal": {
        "openingUnitCents": 28124,
        "floorUnitCents": 24194
      }
    }
  },
  {
    "id": "product-decoration-swing",
    "slug": "decoration-swing",
    "name": "Decoration Swing",
    "brand": "Home",
    "category": "home",
    "msrpUnitCents": 5999,
    "description": "The Decoration Swing is a charming addition to your home decor. Crafted with intricate details, it adds a touch of elegance and whimsy to any room.",
    "committedUnitCount": 10,
    "estimatedUnitPriceCents": 5269,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 5602,
        "floorUnitCents": 4966
      },
      "merchant-northstar": {
        "openingUnitCents": 5701,
        "floorUnitCents": 5066
      },
      "merchant-signal": {
        "openingUnitCents": 5489,
        "floorUnitCents": 4823
      }
    }
  },
  {
    "id": "product-huawei-matebook-x-pro",
    "slug": "huawei-matebook-x-pro",
    "name": "Matebook X Pro",
    "brand": "Huawei",
    "category": "computing",
    "msrpUnitCents": 139999,
    "description": "The Huawei Matebook X Pro is a slim and stylish laptop with a high-resolution touchscreen display, offering a premium experience for users on the go.",
    "committedUnitCount": 30,
    "estimatedUnitPriceCents": 120460,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 130787,
        "floorUnitCents": 114547
      },
      "merchant-northstar": {
        "openingUnitCents": 133937,
        "floorUnitCents": 118677
      },
      "merchant-signal": {
        "openingUnitCents": 129527,
        "floorUnitCents": 111047
      }
    }
  },
  {
    "id": "product-ipad-mini-2021-starlight",
    "slug": "ipad-mini-2021-starlight",
    "name": "iPad Mini 2021 Starlight",
    "brand": "Apple",
    "category": "computing",
    "msrpUnitCents": 49999,
    "description": "The iPad Mini 2021 in Starlight is a compact and powerful tablet from Apple. Featuring a stunning Retina display, powerful A-series chip, and a sleek design, it offers a premium ta",
    "committedUnitCount": 20,
    "estimatedUnitPriceCents": 43365,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 46879,
        "floorUnitCents": 41129
      },
      "merchant-northstar": {
        "openingUnitCents": 48324,
        "floorUnitCents": 42074
      },
      "merchant-signal": {
        "openingUnitCents": 46629,
        "floorUnitCents": 39729
      }
    }
  },
  {
    "id": "product-iphone-13-pro",
    "slug": "iphone-13-pro",
    "name": "iPhone 13 Pro",
    "brand": "Apple",
    "category": "computing",
    "msrpUnitCents": 109999,
    "description": "The iPhone 13 Pro is a cutting-edge smartphone with a powerful camera system, high-performance chip, and stunning display. It offers advanced features for users who demand top-notc",
    "committedUnitCount": 27,
    "estimatedUnitPriceCents": 95414,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 102596,
        "floorUnitCents": 89286
      },
      "merchant-northstar": {
        "openingUnitCents": 106941,
        "floorUnitCents": 93411
      },
      "merchant-signal": {
        "openingUnitCents": 102673,
        "floorUnitCents": 88263
      }
    }
  },
  {
    "id": "product-iphone-5s",
    "slug": "iphone-5s",
    "name": "iPhone 5s",
    "brand": "Apple",
    "category": "computing",
    "msrpUnitCents": 19999,
    "description": "The iPhone 5s is a classic smartphone known for its compact design and advanced features during its release. While it's an older model, it still provides a reliable user experience",
    "committedUnitCount": 31,
    "estimatedUnitPriceCents": 17042,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 18817,
        "floorUnitCents": 16317
      },
      "merchant-northstar": {
        "openingUnitCents": 19213,
        "floorUnitCents": 16813
      },
      "merchant-signal": {
        "openingUnitCents": 18325,
        "floorUnitCents": 16025
      }
    }
  },
  {
    "id": "product-iphone-6",
    "slug": "iphone-6",
    "name": "iPhone 6",
    "brand": "Apple",
    "category": "computing",
    "msrpUnitCents": 29999,
    "description": "The iPhone 6 is a stylish and capable smartphone with a larger display and improved performance. It introduced new features and design elements, making it a popular choice in its t",
    "committedUnitCount": 11,
    "estimatedUnitPriceCents": 26711,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 27938,
        "floorUnitCents": 24818
      },
      "merchant-northstar": {
        "openingUnitCents": 28502,
        "floorUnitCents": 25262
      },
      "merchant-signal": {
        "openingUnitCents": 27824,
        "floorUnitCents": 23774
      }
    }
  },
  {
    "id": "product-iphone-x",
    "slug": "iphone-x",
    "name": "iPhone X",
    "brand": "Apple",
    "category": "computing",
    "msrpUnitCents": 89999,
    "description": "The iPhone X is a flagship smartphone featuring a bezel-less OLED display, facial recognition technology (Face ID), and impressive performance. It represents a milestone in iPhone ",
    "committedUnitCount": 33,
    "estimatedUnitPriceCents": 78451,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 84446,
        "floorUnitCents": 74096
      },
      "merchant-northstar": {
        "openingUnitCents": 85868,
        "floorUnitCents": 76958
      },
      "merchant-signal": {
        "openingUnitCents": 84356,
        "floorUnitCents": 71666
      }
    }
  },
  {
    "id": "product-knoll-saarinen-executive-conference-chair",
    "slug": "knoll-saarinen-executive-conference-chair",
    "name": "Saarinen Executive Conference Chair",
    "brand": "Knoll",
    "category": "home",
    "msrpUnitCents": 49999,
    "description": "The Knoll Saarinen Executive Conference Chair is a modern and ergonomic chair, perfect for your office or conference room with its timeless design.",
    "committedUnitCount": 15,
    "estimatedUnitPriceCents": 42881,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 47064,
        "floorUnitCents": 40764
      },
      "merchant-northstar": {
        "openingUnitCents": 47879,
        "floorUnitCents": 42479
      },
      "merchant-signal": {
        "openingUnitCents": 46109,
        "floorUnitCents": 40009
      }
    }
  },
  {
    "id": "product-lenovo-yoga-920",
    "slug": "lenovo-yoga-920",
    "name": "Yoga 920",
    "brand": "Lenovo",
    "category": "computing",
    "msrpUnitCents": 109999,
    "description": "The Lenovo Yoga 920 is a 2-in-1 convertible laptop with a flexible hinge, allowing you to use it as a laptop or tablet, offering versatility and portability.",
    "committedUnitCount": 15,
    "estimatedUnitPriceCents": 93747,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 104510,
        "floorUnitCents": 90540
      },
      "merchant-northstar": {
        "openingUnitCents": 105797,
        "floorUnitCents": 92817
      },
      "merchant-signal": {
        "openingUnitCents": 100803,
        "floorUnitCents": 87933
      }
    }
  },
  {
    "id": "product-microwave-oven",
    "slug": "microwave-oven",
    "name": "Microwave Oven",
    "brand": "Home",
    "category": "home",
    "msrpUnitCents": 8999,
    "description": "The Microwave Oven is a versatile kitchen appliance for quick and efficient cooking, reheating, and defrosting. Its compact size makes it suitable for various kitchen setups.",
    "committedUnitCount": 27,
    "estimatedUnitPriceCents": 7667,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 8566,
        "floorUnitCents": 7360
      },
      "merchant-northstar": {
        "openingUnitCents": 8629,
        "floorUnitCents": 7567
      },
      "merchant-signal": {
        "openingUnitCents": 8244,
        "floorUnitCents": 7191
      }
    }
  },
  {
    "id": "product-new-dell-xps-13-9300-laptop",
    "slug": "new-dell-xps-13-9300-laptop",
    "name": "New DELL XPS 13 9300 Laptop",
    "brand": "Dell",
    "category": "computing",
    "msrpUnitCents": 149999,
    "description": "The New DELL XPS 13 9300 Laptop is a compact and powerful device, featuring a virtually borderless InfinityEdge display and high-end performance for various tasks.",
    "committedUnitCount": 10,
    "estimatedUnitPriceCents": 133473,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 141449,
        "floorUnitCents": 121949
      },
      "merchant-northstar": {
        "openingUnitCents": 145544,
        "floorUnitCents": 127394
      },
      "merchant-signal": {
        "openingUnitCents": 139034,
        "floorUnitCents": 119684
      }
    }
  },
  {
    "id": "product-oppo-a57",
    "slug": "oppo-a57",
    "name": "A57",
    "brand": "Oppo",
    "category": "computing",
    "msrpUnitCents": 24999,
    "description": "The Oppo A57 is a mid-range smartphone known for its sleek design and capable features. It offers a balance of performance and affordability, making it a popular choice.",
    "committedUnitCount": 31,
    "estimatedUnitPriceCents": 21759,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 23397,
        "floorUnitCents": 20547
      },
      "merchant-northstar": {
        "openingUnitCents": 23767,
        "floorUnitCents": 21092
      },
      "merchant-signal": {
        "openingUnitCents": 23422,
        "floorUnitCents": 20097
      }
    }
  },
  {
    "id": "product-oppo-f19-pro-plus",
    "slug": "oppo-f19-pro-plus",
    "name": "F19 Pro Plus",
    "brand": "Oppo",
    "category": "computing",
    "msrpUnitCents": 39999,
    "description": "The Oppo F19 Pro Plus is a feature-rich smartphone with a focus on camera capabilities. It boasts advanced photography features and a powerful performance for a premium user experi",
    "committedUnitCount": 15,
    "estimatedUnitPriceCents": 34219,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 37819,
        "floorUnitCents": 32539
      },
      "merchant-northstar": {
        "openingUnitCents": 38575,
        "floorUnitCents": 33975
      },
      "merchant-signal": {
        "openingUnitCents": 36795,
        "floorUnitCents": 32275
      }
    }
  },
  {
    "id": "product-oppo-k1",
    "slug": "oppo-k1",
    "name": "K1",
    "brand": "Oppo",
    "category": "computing",
    "msrpUnitCents": 29999,
    "description": "The Oppo K1 series offers a range of smartphones with various features and specifications. Known for their stylish design and reliable performance, the Oppo K1 series caters to div",
    "committedUnitCount": 32,
    "estimatedUnitPriceCents": 25533,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 28367,
        "floorUnitCents": 24587
      },
      "merchant-northstar": {
        "openingUnitCents": 28556,
        "floorUnitCents": 25436
      },
      "merchant-signal": {
        "openingUnitCents": 27455,
        "floorUnitCents": 23795
      }
    }
  },
  {
    "id": "product-realme-c35",
    "slug": "realme-c35",
    "name": "C35",
    "brand": "Realme",
    "category": "computing",
    "msrpUnitCents": 14999,
    "description": "The Realme C35 is a budget-friendly smartphone with a focus on providing essential features for everyday use. It offers a reliable performance and user-friendly experience.",
    "committedUnitCount": 15,
    "estimatedUnitPriceCents": 12785,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 14308,
        "floorUnitCents": 12313
      },
      "merchant-northstar": {
        "openingUnitCents": 14434,
        "floorUnitCents": 12754
      },
      "merchant-signal": {
        "openingUnitCents": 13747,
        "floorUnitCents": 11902
      }
    }
  },
  {
    "id": "product-realme-x",
    "slug": "realme-x",
    "name": "X",
    "brand": "Realme",
    "category": "computing",
    "msrpUnitCents": 29999,
    "description": "The Realme X is a mid-range smartphone known for its sleek design and impressive display. It offers a good balance of performance and camera capabilities for users seeking a qualit",
    "committedUnitCount": 32,
    "estimatedUnitPriceCents": 25868,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 28133,
        "floorUnitCents": 24443
      },
      "merchant-northstar": {
        "openingUnitCents": 29183,
        "floorUnitCents": 25553
      },
      "merchant-signal": {
        "openingUnitCents": 27815,
        "floorUnitCents": 24215
      }
    }
  },
  {
    "id": "product-realme-xt",
    "slug": "realme-xt",
    "name": "XT",
    "brand": "Realme",
    "category": "computing",
    "msrpUnitCents": 34999,
    "description": "The Realme XT is a feature-rich smartphone with a focus on camera technology. It comes equipped with advanced camera sensors, delivering high-quality photos and videos for photogra",
    "committedUnitCount": 12,
    "estimatedUnitPriceCents": 30590,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 33172,
        "floorUnitCents": 28447
      },
      "merchant-northstar": {
        "openingUnitCents": 34093,
        "floorUnitCents": 29648
      },
      "merchant-signal": {
        "openingUnitCents": 32892,
        "floorUnitCents": 27992
      }
    }
  },
  {
    "id": "product-samsung-galaxy-s10",
    "slug": "samsung-galaxy-s10",
    "name": "Galaxy S10",
    "brand": "Samsung",
    "category": "computing",
    "msrpUnitCents": 69999,
    "description": "The Samsung Galaxy S10 is a flagship device featuring a dynamic AMOLED display, versatile camera system, and powerful performance. It represents innovation and excellence in smartp",
    "committedUnitCount": 27,
    "estimatedUnitPriceCents": 61154,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 66296,
        "floorUnitCents": 57196
      },
      "merchant-northstar": {
        "openingUnitCents": 67955,
        "floorUnitCents": 59485
      },
      "merchant-signal": {
        "openingUnitCents": 65757,
        "floorUnitCents": 55537
      }
    }
  },
  {
    "id": "product-samsung-galaxy-s7",
    "slug": "samsung-galaxy-s7",
    "name": "Galaxy S7",
    "brand": "Samsung",
    "category": "computing",
    "msrpUnitCents": 29999,
    "description": "The Samsung Galaxy S7 is a flagship smartphone known for its sleek design and advanced features. It features a high-resolution display, powerful camera, and robust performance.",
    "committedUnitCount": 13,
    "estimatedUnitPriceCents": 25966,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 28202,
        "floorUnitCents": 24542
      },
      "merchant-northstar": {
        "openingUnitCents": 28535,
        "floorUnitCents": 25565
      },
      "merchant-signal": {
        "openingUnitCents": 27920,
        "floorUnitCents": 23810
      }
    }
  },
  {
    "id": "product-samsung-galaxy-s8",
    "slug": "samsung-galaxy-s8",
    "name": "Galaxy S8",
    "brand": "Samsung",
    "category": "computing",
    "msrpUnitCents": 49999,
    "description": "The Samsung Galaxy S8 is a premium smartphone with an Infinity Display, offering a stunning visual experience. It boasts advanced camera capabilities and cutting-edge technology.",
    "committedUnitCount": 14,
    "estimatedUnitPriceCents": 42816,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 47599,
        "floorUnitCents": 40899
      },
      "merchant-northstar": {
        "openingUnitCents": 48574,
        "floorUnitCents": 42724
      },
      "merchant-signal": {
        "openingUnitCents": 46039,
        "floorUnitCents": 40039
      }
    }
  },
  {
    "id": "product-samsung-galaxy-tab-s8-plus-grey",
    "slug": "samsung-galaxy-tab-s8-plus-grey",
    "name": "Galaxy Tab S8 Plus Grey",
    "brand": "Samsung",
    "category": "computing",
    "msrpUnitCents": 59999,
    "description": "The Samsung Galaxy Tab S8 Plus in Grey is a high-performance Android tablet by Samsung. With a large AMOLED display, powerful processor, and S Pen support, it's ideal for productiv",
    "committedUnitCount": 11,
    "estimatedUnitPriceCents": 53429,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 56525,
        "floorUnitCents": 49445
      },
      "merchant-northstar": {
        "openingUnitCents": 57089,
        "floorUnitCents": 51449
      },
      "merchant-signal": {
        "openingUnitCents": 55655,
        "floorUnitCents": 47795
      }
    }
  },
  {
    "id": "product-samsung-galaxy-tab-white",
    "slug": "samsung-galaxy-tab-white",
    "name": "Galaxy Tab White",
    "brand": "Samsung",
    "category": "computing",
    "msrpUnitCents": 34999,
    "description": "The Samsung Galaxy Tab in White is a sleek and versatile Android tablet. With a vibrant display, long-lasting battery, and a range of features, it offers a great user experience fo",
    "committedUnitCount": 32,
    "estimatedUnitPriceCents": 29802,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 33109,
        "floorUnitCents": 28594
      },
      "merchant-northstar": {
        "openingUnitCents": 33428,
        "floorUnitCents": 29508
      },
      "merchant-signal": {
        "openingUnitCents": 32045,
        "floorUnitCents": 28055
      }
    }
  },
  {
    "id": "product-tv-studio-camera-pedestal",
    "slug": "tv-studio-camera-pedestal",
    "name": "TV Studio Camera Pedestal",
    "brand": "ProVision",
    "category": "audio",
    "msrpUnitCents": 49999,
    "description": "The TV Studio Camera Pedestal is a professional-grade camera support system for smooth and precise camera movements in a studio setting. Ideal for broadcast and production.",
    "committedUnitCount": 21,
    "estimatedUnitPriceCents": 43411,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 47504,
        "floorUnitCents": 40954
      },
      "merchant-northstar": {
        "openingUnitCents": 48714,
        "floorUnitCents": 42164
      },
      "merchant-signal": {
        "openingUnitCents": 46679,
        "floorUnitCents": 40079
      }
    }
  },
  {
    "id": "product-vivo-s1",
    "slug": "vivo-s1",
    "name": "S1",
    "brand": "Vivo",
    "category": "computing",
    "msrpUnitCents": 24999,
    "description": "The Vivo S1 is a stylish and mid-range smartphone offering a blend of design and performance. It features a vibrant display, capable camera system, and reliable functionality.",
    "committedUnitCount": 18,
    "estimatedUnitPriceCents": 21531,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 23619,
        "floorUnitCents": 20269
      },
      "merchant-northstar": {
        "openingUnitCents": 24107,
        "floorUnitCents": 21282
      },
      "merchant-signal": {
        "openingUnitCents": 23152,
        "floorUnitCents": 20177
      }
    }
  },
  {
    "id": "product-vivo-v9",
    "slug": "vivo-v9",
    "name": "V9",
    "brand": "Vivo",
    "category": "computing",
    "msrpUnitCents": 29999,
    "description": "The Vivo V9 is a smartphone known for its sleek design and emphasis on capturing high-quality selfies. It features a notch display, dual-camera setup, and a modern design.",
    "committedUnitCount": 35,
    "estimatedUnitPriceCents": 26005,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 28544,
        "floorUnitCents": 24374
      },
      "merchant-northstar": {
        "openingUnitCents": 28859,
        "floorUnitCents": 25409
      },
      "merchant-signal": {
        "openingUnitCents": 27962,
        "floorUnitCents": 24062
      }
    }
  },
  {
    "id": "product-vivo-x21",
    "slug": "vivo-x21",
    "name": "X21",
    "brand": "Vivo",
    "category": "computing",
    "msrpUnitCents": 49999,
    "description": "The Vivo X21 is a premium smartphone with a focus on cutting-edge technology. It features an in-display fingerprint sensor, a high-resolution display, and advanced camera capabilit",
    "committedUnitCount": 33,
    "estimatedUnitPriceCents": 43170,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 46884,
        "floorUnitCents": 40884
      },
      "merchant-northstar": {
        "openingUnitCents": 47859,
        "floorUnitCents": 42159
      },
      "merchant-signal": {
        "openingUnitCents": 46419,
        "floorUnitCents": 39519
      }
    }
  },
  {
    "id": "product-wooden-bathroom-sink-with-mirror",
    "slug": "wooden-bathroom-sink-with-mirror",
    "name": "Wooden Bathroom Sink With Mirror",
    "brand": "Bath Trends",
    "category": "home",
    "msrpUnitCents": 79999,
    "description": "The Wooden Bathroom Sink with Mirror is a unique and stylish addition to your bathroom, featuring a wooden sink countertop and a matching mirror.",
    "committedUnitCount": 11,
    "estimatedUnitPriceCents": 71431,
    "economics": {
      "merchant-keystone": {
        "openingUnitCents": 75719,
        "floorUnitCents": 64999
      },
      "merchant-northstar": {
        "openingUnitCents": 77663,
        "floorUnitCents": 67583
      },
      "merchant-signal": {
        "openingUnitCents": 74407,
        "floorUnitCents": 63607
      }
    }
  }
] as const;
