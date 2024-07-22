import { IconDto, LifegramDto, WhileDto } from '@falang/editor-scheme';
import { IfIconDto } from '@falang/editor-scheme';
import { LifegramFunctionIconStore } from '@falang/editor-scheme';
import { ParallelDto } from '@falang/editor-scheme';
import { SwitchDto } from '@falang/editor-scheme';
import { v4 as uuidV4 } from 'uuid';
import { DocumentDto } from '../../api';

export const getTextDoc = (): IconDto => {

  const iconDto: any = {
    "id": "aeQYmg0AeE6DTkoFKw5QS",
    "alias": "lifegram",
    "headerBlock": {
      "text": "",
      "width": 64,
      "color": "#ffffff"
    },
    "block": {
      "text": "Как научить попугая говорить",
      "width": 160,
      "color": "#ffffff"
    },
    "gaps": [],
    "finish": {
      "id": "yMAec9aHWp3h4hHUJ2eYv",
      "alias": "system",
      "block": {
        "text": "Завершение",
        "width": 96,
        "color": "#ffffff"
      },
      "children": [],
      "return": {
        "text": "Конец",
        "width": 160,
        "color": "#ffffff"
      }
    },
    "functions": [
      {
        "id": "F_Gq12gM6jXXmSYeiLBpO",
        "alias": "system",
        "block": {
          "text": "Пояснения к алгоритму",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "_fU0Lu4tQCZWj59DS9bfA",
            "alias": "action",
            "block": {
              "text": "Что нужно знать о попугаях:\n\n1. Попугай-живое существо, которое требует от своего хозяина постоянного внимания и заботы.\n\n2. Если ни у кого из членов семьи нет свободного времени для занятий с попугаем, лучше отказаться от покупки.\n\n3. Разговаривать с попугаем нужно ласково, с любовью.\n\n5. Ни в коем случае нельзя кричать на попугая, ругать и наказывать его.",
              "width": 160,
              "color": "#ffffff"
            }
          }
        ],
        "returns": [
          {
            "text": "Скоро ли будет результат?",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "AawNzmN5fcCNLQl8iV_YM",
        "alias": "system",
        "block": {
          "text": "Скоро ли будет результат?",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "I5fK6poSTxuwftuSqhW2_",
            "alias": "action",
            "block": {
              "text": "Вы хотите сразу и быстро научить птицу разговаривать? Так не получится. Сначала нужно окружить попугая заботой и вниманием, полностью завоевать его доверие. Двигаться к цели надо мелкими шажками. Сперва создайте для своего любимца уют и комфорт, помогите ему преодолеть страх. Затем научите его есть с руки, садиться на руку, на плечо, летать по комнате. И только после этого можно начинать учить отдельные слова, а затем и отдельные фразы.",
              "width": 160,
              "color": "#ffffff"
            }
          }
        ],
        "returns": [
          {
            "text": "Подготовка к покупке попугая",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "wzjA_FneAyMw1bKIk9i-q",
        "alias": "system",
        "block": {
          "text": "Подготовка к покупке попугая",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "OwBYendwJcWka7XPpx8AT",
            "alias": "action",
            "block": {
              "text": "Купи клетку для попугая",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "euYy3yUy9jnmvK0UQCbrl",
            "alias": "action",
            "block": {
              "text": "Вставь в клетку кормушку",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "VVQhR0eFgAk-nQXnwZts9",
            "alias": "action",
            "block": {
              "text": "Вибери комнату, где будет жить попугай",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "jMpuHc2rldGykorAt3sb8",
            "alias": "action",
            "block": {
              "text": "Выбери место для клетки",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "eel3aJplfcEmeFi1OSOin",
            "alias": "action",
            "block": {
              "text": "Повесь клетку в нужное место",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "zjpxI_6G7RltPDNblMdpd",
            "alias": "if",
            "block": {
              "text": "Нравится?",
              "width": 160,
              "color": "#ffffff"
            },
            "trueOnRight": false,
            "gaps": [],
            "children": [
              {
                "alias": "system",
                "id": "wWrzKVIMXRCADuRyvJbMO",
                "block": {
                  "width": 0
                },
                "children": []
              },
              {
                "alias": "system",
                "id": "xCRBW1b3uDOWjICWencvt",
                "block": {
                  "width": 0
                },
                "children": [
                  {
                    "id": "V0N_2q8OwISzuEBTELND9",
                    "alias": "action",
                    "block": {
                      "text": "Поставь клетку в другое место",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ]
              }
            ]
          },
          {
            "id": "upGOUG08AtlHOe0vvPmbN",
            "alias": "action",
            "block": {
              "text": "Создай в комнате нужную температуру и влажность",
              "width": 160,
              "color": "#ffffff"
            }
          }
        ],
        "returns": [
          {
            "text": "Покупка попугая",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "o246Amwekp_dk6o2pB965",
        "alias": "system",
        "block": {
          "text": "Покупка попугая",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "roJs0YztrKHeVz9Rpus8z",
            "alias": "action",
            "block": {
              "text": "Посети питомник или зоомагазин",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "ubYobVnQjBlGfsO8f6rYI",
            "alias": "action",
            "block": {
              "text": "Посоветуйся с продавцом",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "kda6uUcMV5p6as5rigyAV",
            "alias": "switch",
            "block": {
              "text": "Выбери возраст",
              "width": 160,
              "color": "#ffffff"
            },
            "gaps": [],
            "children": [
              {
                "alias": "system",
                "block": {
                  "text": "Птенец",
                  "width": 160,
                  "color": "#ffffff"
                },
                "children": [
                  {
                    "id": "Kaxc0My3Gf6NWwndCzBaI",
                    "alias": "action",
                    "block": {
                      "text": "Хочу птенца",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "id": "jIHwBtji1ZIz1PMV5jdk7"
              },
              {
                "alias": "system",
                "block": {
                  "text": "Взрослая птица",
                  "width": 160,
                  "color": "#ffffff"
                },
                "children": [
                  {
                    "id": "DUulfoSe4MDeJJMNMV_U2",
                    "alias": "action",
                    "block": {
                      "text": "Хочу взрослую птицу",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "id": "CGDTtQlkhvsrdZmDGb56V"
              }
            ]
          },
          {
            "id": "sTBRp-bqELKvfY0zUr2FW",
            "alias": "switch",
            "block": {
              "text": "Выбери попугая",
              "width": 160,
              "color": "#ffffff"
            },
            "gaps": [],
            "children": [
              {
                "alias": "system",
                "block": {
                  "text": "Жако",
                  "width": 160,
                  "color": "#ffffff"
                },
                "children": [
                  {
                    "id": "s2sx71tjgJIVlS_3m3HYa",
                    "alias": "action",
                    "block": {
                      "text": "Купи жако",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "id": "wMcKVDOf3JbybPPBvQVUb"
              },
              {
                "alias": "system",
                "block": {
                  "text": "Какаду",
                  "width": 160,
                  "color": "#ffffff"
                },
                "children": [
                  {
                    "id": "NRsF4HQEMirlF1bfA0b5P",
                    "alias": "action",
                    "block": {
                      "text": "Купи какаду",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "id": "lXGjD08RSITrDTLENl6GB"
              },
              {
                "alias": "system",
                "block": {
                  "text": "Волнистый",
                  "width": 160,
                  "color": "#ffffff"
                },
                "children": [
                  {
                    "id": "Aa5Fcp2E57lUhODw0_nyp",
                    "alias": "action",
                    "block": {
                      "text": "Купи волнистого попугая",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "id": "yGwMIRS99vFP-dI86QqUW"
              }
            ]
          }
        ],
        "returns": [
          {
            "text": "Переселение в новую клетку",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "pGtZUBvdgl8vtVSuvUMie",
        "alias": "system",
        "block": {
          "text": "Переселение в новую клетку",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "mK4g9ZAjf6YSzsc2nCXnW",
            "alias": "action",
            "block": {
              "text": "Принеси попугая домой в старой клетке",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "65kbbdy3GPrGa8sXunCOg",
            "alias": "action",
            "block": {
              "text": "Заранее приготовь новую клетку и установи в ней все аксессуары, поилки, кормушки, жердочки, игрушки, качельки",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "GacY9TaVoNuNnf2LFsK9k",
            "alias": "action",
            "block": {
              "text": "Клетки соедини дверками и оставь их открытыми",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "vFf4vGx2N2vyCdcAAf1ph",
            "alias": "while",
            "block": {
              "text": "Птица перешла в новую клетку?",
              "width": 128,
              "color": "#ffffff"
            },
            "trueIsMain": true,
            "children": [
              {
                "id": "q21wcY7zgan6yA8XFxIdW",
                "alias": "action",
                "block": {
                  "text": "Подожди",
                  "width": 160,
                  "color": "#ffffff"
                }
              }
            ]
          },
          {
            "id": "aY1drhg1QtlPizHtLZnm4",
            "alias": "action",
            "block": {
              "text": "Убери старую клетку",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "NdTVLnRoKUwW5KxrqTCMY",
            "alias": "action",
            "block": {
              "text": "Оставь попугая в покое. Дай ему привыкнуть к новой клетке, новой обстановке, новым людям",
              "width": 160,
              "color": "#ffffff"
            }
          }
        ],
        "returns": [
          {
            "text": "Приручение попугая",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "1y5gyWL7UzB9mcenXT0k7",
        "alias": "system",
        "block": {
          "text": "Приручение попугая",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "2Uerkx-mUVH_I_Svyylaw",
            "alias": "while",
            "block": {
              "text": "Попугай начал брать корм с кормушки?",
              "width": 128,
              "color": "#ffffff"
            },
            "trueIsMain": true,
            "children": [
              {
                "id": "hz6sAjyiRbutXFx0wMCrk",
                "alias": "action",
                "block": {
                  "text": "Разговаривай с попугаем лаково и нежно",
                  "width": 160,
                  "color": "#ffffff"
                }
              },
              {
                "id": "bqaM-bZzY17T-NghKqLGF",
                "alias": "if",
                "block": {
                  "text": "Птица забилась в угол клетки?",
                  "width": 160,
                  "color": "#ffffff"
                },
                "trueOnRight": true,
                "gaps": [],
                "children": [
                  {
                    "alias": "system",
                    "id": "233It95SiFAuaIyprap6n",
                    "block": {
                      "width": 0
                    },
                    "children": []
                  },
                  {
                    "alias": "system",
                    "id": "lb0si7AHYJ6xy80rXBbfW",
                    "block": {
                      "width": 0
                    },
                    "children": [
                      {
                        "id": "DaZFLyh_BXZ5aF5ODzW0K",
                        "alias": "action",
                        "block": {
                          "text": "Не переживай, оставь в покое птицу",
                          "width": 160,
                          "color": "#ffffff"
                        }
                      }
                    ]
                  }
                ]
              },
              {
                "id": "VuLicBYm_zY6U5vqoexrX",
                "alias": "if",
                "block": {
                  "text": "Попугай боится подойти к кормушке?",
                  "width": 160,
                  "color": "#ffffff"
                },
                "trueOnRight": true,
                "gaps": [],
                "children": [
                  {
                    "alias": "system",
                    "id": "6x0xsqVq8uIAupvfD_oIX",
                    "block": {
                      "width": 0
                    },
                    "children": []
                  },
                  {
                    "alias": "system",
                    "id": "JH6CsByhc7VD6NWuvzgkM",
                    "block": {
                      "width": 0
                    },
                    "children": [
                      {
                        "id": "4aMhBBYjRIvWu76Mzv2-5",
                        "alias": "action",
                        "block": {
                          "text": "Рассыпь корм по дну кормушки",
                          "width": 160,
                          "color": "#ffffff"
                        }
                      }
                    ]
                  }
                ]
              },
              {
                "id": "xW-OLj0pfn7pL4wLEM0Cw",
                "alias": "action",
                "block": {
                  "text": "Подожди",
                  "width": 160,
                  "color": "#ffffff"
                }
              }
            ]
          }
        ],
        "returns": [
          {
            "text": "Учимся брать корм с ладони",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "17BGfX04zYrirBGq2vZMx",
        "alias": "system",
        "block": {
          "text": "Учимся брать корм с ладони",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "1PXZrzVL42nq_eRxKeAjo",
            "alias": "action",
            "block": {
              "text": "Разговаривай с попугаем лаково и нежно",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "dO8dH64lDNSwPW9JXwoqM",
            "alias": "action",
            "block": {
              "text": "Дождись утра",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "zJ18GZ84LIoywueckcdvS",
            "alias": "action",
            "block": {
              "text": "Научи приучать попугая к ручкам",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "kjHbJJmVaTepTYzF4TjpJ",
            "alias": "action",
            "block": {
              "text": "Положи себе на открытую ладонь вкусные зерна",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "XdrXniP2v8ouhzrou85Uq",
            "alias": "parallel",
            "block": {
              "width": 100
            },
            "gaps": [],
            "children": [
              {
                "id": "C44O2Z_kwp-0Ii-IEUHBb",
                "children": [
                  {
                    "id": "X1e5WYRloXs9XyfHrnbap",
                    "alias": "action",
                    "block": {
                      "text": "Медленно, избегая резких даижений, просунь в клетку открытую ладонь с зернами. ",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ]
              },
              {
                "id": "COT2VwSwpIauPEr5UlQHY",
                "children": [
                  {
                    "id": "QUlMWurFhoV4spgaEdU7l",
                    "alias": "action",
                    "block": {
                      "text": "Одновременно говори с попугаем ласково, хвали его.",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ]
              }
            ]
          },
          {
            "id": "JCNX7DV-WmED75e42eKKa",
            "alias": "if",
            "block": {
              "text": "Попугая начал есть зерна с ладони?\n",
              "width": 160,
              "color": "#ffffff"
            },
            "trueOnRight": false,
            "gaps": [
              5
            ],
            "children": [
              {
                "alias": "system",
                "id": "72deBNOiOQmdKXJ_vZAc1",
                "block": {
                  "width": 0
                },
                "children": []
              },
              {
                "alias": "system",
                "id": "xDjmqENaVR0y-aHRj_4dd",
                "block": {
                  "width": 0
                },
                "children": [
                  {
                    "id": "DUcWWCyA4Zk_6EeIvNaV9",
                    "alias": "action",
                    "block": {
                      "text": "Не беда! Завтра попробуем еще раз!",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "out": {
                  "type": "return",
                  "level": 2,
                  "alias": "system",
                  "block": {
                    "text": "",
                    "width": 64,
                    "color": "#ffffff"
                  },
                  "id": "J7whd0l-fC4wRJS_OekXw"
                }
              }
            ]
          }
        ],
        "returns": [
          {
            "text": "Усложняем задачу",
            "width": 160,
            "color": "#ffffff"
          },
          {
            "text": "Учимся брать корм с ладони",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "99rdSwd5lo-roM9wdwzSP",
        "alias": "system",
        "block": {
          "text": "Усложняем задачу",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "hNJVrTbLLpX_MjrFD7JxN",
            "alias": "while",
            "block": {
              "text": "Птица уверенно берет корм с руки?",
              "width": 160,
              "color": "#ffffff"
            },
            "trueIsMain": true,
            "children": [
              {
                "id": "ZluaxYcTea5FMsImfejCi",
                "alias": "action",
                "block": {
                  "text": "Каждое утро продолжай кормить с руки",
                  "width": 160,
                  "color": "#ffffff"
                }
              }
            ]
          },
          {
            "id": "GLtJTb4kudqkfrxHQg5l-",
            "alias": "action",
            "block": {
              "text": "Усложни задание, отодвигая ладонь все дальше от птицы, пока она не будет вынуждена сесть на руку",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "beEzbXmseJ9_K-0DSbQoV",
            "alias": "action",
            "block": {
              "text": "Это трудная задача, но ее надо решить",
              "width": 160,
              "color": "#ffffff"
            }
          }
        ],
        "returns": [
          {
            "text": "Учимся сидеть на руке",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "jD6Y55PrhmTMR2Y1HfLIk",
        "alias": "system",
        "block": {
          "text": "Учимся сидеть на руке",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "EjBD1Rbt0sMgyYYbTd-_3",
            "alias": "action",
            "block": {
              "text": "Разговаривай с попугаем нежно и ласково",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "uwyOJqUC7388_kFuVA1-I",
            "alias": "action",
            "block": {
              "text": "Дождись утра",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "E1yCWeaeiAVV7y2Pysui4",
            "alias": "action",
            "block": {
              "text": "Начни приучать попугая садиться на руку, отодвигая от него ладонь с зернами",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "Q-xCbQ-Is7xK_lzTN9KoF",
            "alias": "if",
            "block": {
              "text": "Попугая начал уверенно садиться на руку?",
              "width": 160,
              "color": "#ffffff"
            },
            "trueOnRight": false,
            "gaps": [
              5
            ],
            "children": [
              {
                "alias": "system",
                "id": "tXixOJN9LWM48qy3EVtr_",
                "block": {
                  "width": 0
                },
                "children": []
              },
              {
                "alias": "system",
                "id": "hFGUD5qH-7ybB7NsjfOtt",
                "block": {
                  "width": 0
                },
                "children": [
                  {
                    "id": "H4VczxeAlgPG2YKbrNoZf",
                    "alias": "action",
                    "block": {
                      "text": "Не беда! Завтра попробуем еще раз!",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "out": {
                  "type": "return",
                  "level": 2,
                  "alias": "system",
                  "block": {
                    "text": "",
                    "width": 64,
                    "color": "#ffffff"
                  },
                  "id": "nHK_y18qNYvACeoizfjEm"
                }
              }
            ]
          }
        ],
        "returns": [
          {
            "text": "Учимся сидеть на плече",
            "width": 160,
            "color": "#ffffff"
          },
          {
            "text": "Учимся сидеть на руке",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "X19Y1noOIojh1gioha-x6",
        "alias": "system",
        "block": {
          "text": "Учимся сидеть на плече",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "YwDFuuLGQQGS8UdTbsGko",
            "alias": "action",
            "block": {
              "text": "Разговаривай с попугаем нежно и ласково",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "RfinFMxrsQfdeRy4HZksz",
            "alias": "action",
            "block": {
              "text": "Дождись утра",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "OuTk4edUO_4WDFsyYRbHl",
            "alias": "action",
            "block": {
              "text": "Начни приучать попугая садиться на плечо",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "tpZpOVBnKI7K78Jsn6K7K",
            "alias": "action",
            "block": {
              "text": "Посади попугая на руку",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "rofr6UFQiS_iJXqluvvU9",
            "alias": "action",
            "block": {
              "text": "Медленно, избегая резких движений, поднеси попугая к плечу",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "FD3RO8aCNJyfhhygM9jxH",
            "alias": "action",
            "block": {
              "text": "Помоги попугаю перебраться на плечо",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "A0dCfnR69pDqCnw_W9wYv",
            "alias": "if",
            "block": {
              "text": "Попугай начал уверенно садиться на плечо?",
              "width": 160,
              "color": "#ffffff"
            },
            "trueOnRight": false,
            "gaps": [
              4
            ],
            "children": [
              {
                "alias": "system",
                "id": "chi2I-da9mbMXabfg0zFa",
                "block": {
                  "width": 0
                },
                "children": []
              },
              {
                "alias": "system",
                "id": "cz6utrhMskssn3nwS5zZx",
                "block": {
                  "width": 0
                },
                "children": [],
                "out": {
                  "type": "return",
                  "level": 2,
                  "alias": "system",
                  "block": {
                    "text": "Не беда! Завтра попробуем еще раз!",
                    "width": 160,
                    "color": "#ffffff"
                  },
                  "id": "CvXR5IZ3Ww8-pw6do-St9"
                }
              }
            ]
          }
        ],
        "returns": [
          {
            "text": "Как уберечь попугая",
            "width": 160,
            "color": "#ffffff"
          },
          {
            "text": "Учимся сидеть на плече",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "DYvs6Uz95-_1M52HrHisV",
        "alias": "system",
        "block": {
          "text": "Как уберечь попугая",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "mrMgvZU3R7N0bWs2kBKkq",
            "alias": "action",
            "block": {
              "text": "Прирученного попугая надо периодически выпускать из клетки. При этом нельзя забывать об опасности.\nВедь попугаи не только очень подвижны, но и весьма любопытны. Если за ними не следить, они могут поручить серьезные травмы или даже погибнуть.",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "ArJrPwlZUj8E1lTkC7BMZ",
            "alias": "action",
            "block": {
              "text": "Закрой или затяни сеткой форточки и окна, чтоб не улетел",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "BpzoQsQmJyjqtKLaRIPXu",
            "alias": "action",
            "block": {
              "text": "Убери все банки с водой - залезет и захлебнется",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "5Xd3ZXRFF97qaDt5ooFPG",
            "alias": "action",
            "block": {
              "text": "Убери цветочный вазы - залезет и сломает шею",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "FsddrXQMg3EalNrduZLd-",
            "alias": "action",
            "block": {
              "text": "Накрой аквариум стеклом, чтобы не утонул",
              "width": 160,
              "color": "#ffffff"
            }
          }
        ],
        "returns": [
          {
            "text": "Новые заботы",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "K_vGWrmeFL1vkwQs7STnQ",
        "alias": "system",
        "block": {
          "text": "Новые заботы",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "rw55-3cOL96cO0Ng9l2On",
            "alias": "action",
            "block": {
              "text": "Заделай все щели между стенами и шкафами. Накрой их подходящей по размеру рейкой - иначе залезет и погибнет",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "n8Bl6zbu2YAkTAh3iUknJ",
            "alias": "action",
            "block": {
              "text": "Сними занавески, имеющие кропноячистую структуру. Попугаи запутываются в них коготками и, пытаясь вырваться, ломают или вывихивают лапки",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "3zOfvSNWZCeft2fde5NM_",
            "alias": "action",
            "block": {
              "text": "Попугаи любят сидеть на двери. Невнимательный хозяин может захлопнуть дверь, а птица получит травмы: перелом голени, цевки или бедра.",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "3Lbgkn1wz67uYv8BUcFBf",
            "alias": "action",
            "block": {
              "text": "Закрывай двери осторожно, не хлопай - погубишь птицу",
              "width": 160,
              "color": "#ffffff"
            }
          }
        ],
        "returns": [
          {
            "text": "Летаем по комнате",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "0YAVelEQ-e08rWh1G9EkP",
        "alias": "system",
        "block": {
          "text": "Летаем по комнате",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "ME5jhN8qe_X0bOBHc83iy",
            "alias": "action",
            "block": {
              "text": "Выпусти попугая летать по комнате",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "jMxu5bWAVwTBi4qDciik8",
            "alias": "action",
            "block": {
              "text": "Ура! Попугай летает! Какая радость!",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "lrawIAixSWL8oOmHjeQ-x",
            "alias": "action",
            "block": {
              "text": "Чем больше попугай будет двигаться, тем лучше он станет себя чувствовать. И тем быстрее проявятся его способности к разговору.",
              "width": 160,
              "color": "#ffffff"
            }
          }
        ],
        "returns": [
          {
            "text": "Учим свое имя",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "BeHYkYl-U85nRLQr3lxh7",
        "alias": "system",
        "block": {
          "text": "Учим свое имя",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [
          1,
          1
        ],
        "children": [
          {
            "id": "Pu95LRwBAe5iEs9YgAmOQ",
            "alias": "action",
            "block": {
              "text": "Придумай птице имя, например, \"Кеша\"",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "0X0dh3-Cp_oYvktSIo6Eq",
            "alias": "switch",
            "block": {
              "text": "Где сидит попугай",
              "width": 160,
              "color": "#ffffff"
            },
            "gaps": [],
            "children": [
              {
                "alias": "system",
                "block": {
                  "text": "На руке",
                  "width": 160,
                  "color": "#ffffff"
                },
                "children": [
                  {
                    "id": "ttz5_KSH6QjjV4Q3neJpI",
                    "alias": "action",
                    "block": {
                      "text": "Подними руку до уровня лица и отчетливо произнеси \"Кеша\"",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "id": "lTV5hrDjcFXxWv4gkLDgC"
              },
              {
                "alias": "system",
                "block": {
                  "text": "На плече",
                  "width": 160,
                  "color": "#ffffff"
                },
                "children": [
                  {
                    "id": "FQS1xc8gMhKb2FWY9D1wj",
                    "alias": "action",
                    "block": {
                      "text": "Поверни к птице голову и скажи \"Кеша\"",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "id": "v0te1IpuuE3XQvgpf9pd1"
              }
            ]
          },
          {
            "id": "5oOSB-3a4eiEUJwPcozNu",
            "alias": "action",
            "block": {
              "text": "Несколько раз четко и ясно повтори \"Кеша\"",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "RJqej0SCA7RSVg1WSiwEe",
            "alias": "if",
            "block": {
              "text": "Попугай начал повторять свое имя?",
              "width": 160,
              "color": "#ffffff"
            },
            "trueOnRight": false,
            "gaps": [],
            "children": [
              {
                "alias": "system",
                "id": "B9xPRUWByVng9mSj-pzj0",
                "block": {
                  "width": 0
                },
                "children": [
                  {
                    "id": "2iDRmpabOvcUJw04REOLV",
                    "alias": "action",
                    "block": {
                      "text": "Отлично!",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ]
              },
              {
                "alias": "system",
                "id": "wAhXmUjp5_zSuww-35eSr",
                "block": {
                  "width": 0
                },
                "children": [
                  {
                    "id": "A_9ndRofAJhaGvvcjgUyL",
                    "alias": "if",
                    "block": {
                      "text": "Год прошел?",
                      "width": 160,
                      "color": "#ffffff"
                    },
                    "trueOnRight": true,
                    "gaps": [],
                    "children": [
                      {
                        "alias": "system",
                        "id": "2SBxPKmESEzgKKcZKc8jv",
                        "block": {
                          "width": 0
                        },
                        "children": [
                          {
                            "id": "cdchsmMZOk6nmtmW3W9pk",
                            "alias": "action",
                            "block": {
                              "text": "Завтра попробуем еще раз",
                              "width": 160,
                              "color": "#ffffff"
                            }
                          }
                        ]
                      },
                      {
                        "alias": "system",
                        "id": "eMexKSBKikni6BLzD4Jvr",
                        "block": {
                          "width": 0
                        },
                        "children": [
                          {
                            "id": "ASgoi6y4Jeyq7KggdFUsS",
                            "alias": "if",
                            "block": {
                              "text": "Попугай научился говорить свое имя?",
                              "width": 160,
                              "color": "#ffffff"
                            },
                            "trueOnRight": false,
                            "gaps": [],
                            "children": [
                              {
                                "alias": "system",
                                "id": "Pj_PkAedZ19RECrttLrAK",
                                "block": {
                                  "width": 0
                                },
                                "children": [
                                  {
                                    "id": "2YCa5U-sToPG4YImWwiqj",
                                    "alias": "action",
                                    "block": {
                                      "text": "Слава богу! Наконец-то!",
                                      "width": 160,
                                      "color": "#ffffff"
                                    }
                                  }
                                ]
                              },
                              {
                                "alias": "system",
                                "id": "9P8h5HWv4ClXjlxleJImf",
                                "block": {
                                  "width": 0
                                },
                                "children": [
                                  {
                                    "id": "Lua1eEmVpV8dm9gcklYRI",
                                    "alias": "action",
                                    "block": {
                                      "text": "Какой бестолковый!",
                                      "width": 160,
                                      "color": "#ffffff"
                                    }
                                  }
                                ],
                                "out": {
                                  "type": "return",
                                  "level": 4,
                                  "alias": "system",
                                  "block": {
                                    "text": "",
                                    "width": 64,
                                    "color": "#ffffff"
                                  },
                                  "id": "R68zsUBHS95ovG3ESijat"
                                }
                              }
                            ]
                          }
                        ],
                        "out": {
                          "type": "return",
                          "level": 3,
                          "alias": "system",
                          "block": {
                            "text": "",
                            "width": 64,
                            "color": "#ffffff"
                          },
                          "id": "hs5Ne7Q8pqMTipclBkada"
                        }
                      }
                    ]
                  }
                ],
                "out": {
                  "type": "return",
                  "level": 2,
                  "alias": "system",
                  "block": {
                    "text": "",
                    "width": 64,
                    "color": "#ffffff"
                  },
                  "id": "UoQxAmh6Cq3In32EFYDFd"
                }
              }
            ]
          }
        ],
        "returns": [
          {
            "text": "Учим другие слова",
            "width": 160,
            "color": "#ffffff"
          },
          {
            "text": "Учим свое имя",
            "width": 160,
            "color": "#ffffff"
          },
          {
            "text": "Учим другие слова",
            "width": 160,
            "color": "#ffffff"
          },
          {
            "text": "Поиск доброго человека",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "w5JLbLt9DtgHV7H-aN1Ep",
        "alias": "system",
        "block": {
          "text": "Учим другие слова",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "ISy64bowIqAJVch0iFk52",
            "alias": "action",
            "block": {
              "text": "Разговаривай с попугаем нежно и ласково",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "Rb8LCcrwOAlbeQ8PnSXb6",
            "alias": "action",
            "block": {
              "text": "Дождись утра",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "hUUbNI-PksOeVUVnrb1Mi",
            "alias": "action",
            "block": {
              "text": "Начни учить попугая новым словам",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "tdIW3WvK7xRIZzQkIYLRO",
            "alias": "action",
            "block": {
              "text": "Говори простые слова, например \"птица\", \"хороший\"",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "rmZwgKP1o0QpVn61G4B8I",
            "alias": "action",
            "block": {
              "text": "Несколько раз, четко и ясно повтори \"птица\"",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "9H8g_XqZVbBxes345tKpK",
            "alias": "action",
            "block": {
              "text": "Несколько раз четко и ясно повтори \"хороший\"",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "R-h9Ku-OQRY5YehB_9AVe",
            "alias": "if",
            "block": {
              "text": "Попугай выучил новые слова?",
              "width": 160,
              "color": "#ffffff"
            },
            "trueOnRight": false,
            "gaps": [
              5
            ],
            "children": [
              {
                "alias": "system",
                "id": "2ryojPKOjmOD6ffIxXwNq",
                "block": {
                  "width": 0
                },
                "children": []
              },
              {
                "alias": "system",
                "id": "ctzc1xsJ6SzYeOC6Yoaoa",
                "block": {
                  "width": 0
                },
                "children": [
                  {
                    "id": "29dAd751tVfRMo03GHWqm",
                    "alias": "action",
                    "block": {
                      "text": "Не беда! Завтра попробуем еще раз!",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "out": {
                  "type": "return",
                  "level": 1,
                  "alias": "system",
                  "block": {
                    "text": "",
                    "width": 160,
                    "color": "#ffffff"
                  },
                  "id": "MN_mDxHBzjcCRT1uWW7y_"
                }
              }
            ]
          }
        ],
        "returns": [
          {
            "text": "Учим первую фразу",
            "width": 160,
            "color": "#ffffff"
          },
          {
            "text": "Учим другие слова",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "A3XaXp31DEXnQ8KCKWlke",
        "alias": "system",
        "block": {
          "text": "Учим первую фразу",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "nLvvK7MF4fpVu5XRrku6a",
            "alias": "action",
            "block": {
              "text": "Ваш попугай уже знает несколько слов. Пора начинать учить простые фразыю Врядли вам понтравится, если он все время будет бессмысленно кричать \"Попка - дурак!\". Гораздо приятнее, если разговор птицы будет казаться разумным и испоненным смысла.",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "5CFVytWJtITc6yxGPnj9b",
            "alias": "action",
            "block": {
              "text": "Вот пример.\nКогда попугай забирается в клетку, скажи: \"Иди, птица, в дом\"",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "WYrHahfufAPSNlELLgdS6",
            "alias": "action",
            "block": {
              "text": "Всякий раз, когда он ворзвращается в клетку, скажи: \"Иди, птица, в дом\"",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "wBIra2oqDkBOxseueEuGx",
            "alias": "action",
            "block": {
              "text": "Пройдет время, попугая запомнит подсказку и, ныряя в клетку, сам будет повторять: \"Иди, птица, в дом\"",
              "width": 160,
              "color": "#ffffff"
            }
          }
        ],
        "returns": [
          {
            "text": "Учим другие фразы",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "d_Yx5Mwrd3IUbmiINRF9g",
        "alias": "system",
        "block": {
          "text": "Учим другие фразы",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "CfLCzsGz3TlV88yO4qrQG",
            "alias": "action",
            "block": {
              "text": "Сколько людей, столько мнений. Каждый хозяин воспиывает своего питомца на свой лад. Попробуйты и вы найти свой собственный стиль.",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "GTK2GbtAPWJasjX50OdV1",
            "alias": "action",
            "block": {
              "text": "Говори простые фразы, например: \"Кеша хороший\"",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "U5SmYSq46-UMCS5VRYq-d",
            "alias": "action",
            "block": {
              "text": "Несколько раз, четко и ясно повтори \"Кеша хороший\"",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "3Vl1h7QTvHuKTrvIIHJBK",
            "alias": "action",
            "block": {
              "text": "Каждый раз, давая питомцу корм, произноси одну и ту же фразу \"Птица хочет кушать\". А когда он начинает есть, повторяй \"Очень вкусно\"",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "yakxHw3gSqaO9Tvv_d2W1",
            "alias": "action",
            "block": {
              "text": "Не гонись за количеством. Лучше меньше, да лучше",
              "width": 160,
              "color": "#ffffff"
            }
          }
        ],
        "returns": [
          {
            "text": "Попугай разговорился",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "i1v18sZFdEIraBth6Ga7F",
        "alias": "system",
        "block": {
          "text": "Попугай разговорился",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [
          1
        ],
        "children": [
          {
            "id": "SKpAh20fsu3K0ZWcM5oY1",
            "alias": "action",
            "block": {
              "text": "Большинство обученных попугаев сами пополняют свой словарный запас, запоминая не только  слова хозяев, но и фразы, услышанные от гостей или даже по телевизору.",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "pYkYjq_tXzowspv8jGm1Q",
            "alias": "action",
            "block": {
              "text": "Ура! попугай разговорился! Какая радость!",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "URr4pDuSaHT_qRZj3LbVu",
            "alias": "if",
            "block": {
              "text": "Попугай жил долго и счастливо?",
              "width": 160,
              "color": "#ffffff"
            },
            "trueOnRight": false,
            "gaps": [
              5
            ],
            "children": [
              {
                "alias": "system",
                "id": "DiPKvOqjN_3aoMq0MxfzL",
                "block": {
                  "width": 0
                },
                "children": []
              },
              {
                "alias": "system",
                "id": "Nmv2yVEnUOdYOxHtNwp7A",
                "block": {
                  "width": 0
                },
                "children": [
                  {
                    "id": "8-pqiPInduFPxEyvB0Uq1",
                    "alias": "switch",
                    "block": {
                      "text": "Что случилось?",
                      "width": 160,
                      "color": "#ffffff"
                    },
                    "gaps": [],
                    "children": [
                      {
                        "alias": "system",
                        "block": {
                          "text": "Кошка съела",
                          "width": 160,
                          "color": "#ffffff"
                        },
                        "children": [
                          {
                            "id": "I4Z0NukvI8POYWN4p1PN6",
                            "alias": "action",
                            "block": {
                              "text": "Какой ужас! Убью мерзавку!",
                              "width": 160,
                              "color": "#ffffff"
                            }
                          }
                        ],
                        "id": "7cGPTb8Joj0vz1Q2ChCjs"
                      },
                      {
                        "alias": "system",
                        "block": {
                          "text": "Улетел в окно",
                          "width": 160,
                          "color": "#ffffff"
                        },
                        "children": [
                          {
                            "id": "OF3mNtt0lQ6sWaoDJuVnD",
                            "alias": "action",
                            "block": {
                              "text": "Кеша, прощай навеки!",
                              "width": 160,
                              "color": "#ffffff"
                            }
                          }
                        ],
                        "id": "lG9pqSpnvWXGC-7kOjUFJ"
                      },
                      {
                        "alias": "system",
                        "block": {
                          "text": "Кто-то украл, и я знаю кто",
                          "width": 160,
                          "color": "#ffffff"
                        },
                        "children": [
                          {
                            "id": "oRW9IahB6VTufVNEzXYlG",
                            "alias": "action",
                            "block": {
                              "text": "Ну, заяц, погоди!",
                              "width": 160,
                              "color": "#ffffff"
                            }
                          }
                        ],
                        "id": "5rBj-EzEs9sgLeFc3x7tW"
                      }
                    ]
                  },
                  {
                    "id": "JKlMd7KViukP9pM7UCRBn",
                    "alias": "action",
                    "block": {
                      "text": "Не горюй! Купи другого попугая",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "out": {
                  "type": "return",
                  "level": 2,
                  "alias": "system",
                  "block": {
                    "text": "",
                    "width": 64,
                    "color": "#ffffff"
                  },
                  "id": "4UNFhenMQoi6BQafL4wQ-"
                }
              }
            ]
          }
        ],
        "returns": [
          {
            "text": "Завершение",
            "width": 160,
            "color": "#ffffff"
          },
          {
            "text": "Покупка попугая",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      },
      {
        "id": "OcfM7sNG8tZFtpKBV1_H3",
        "alias": "system",
        "block": {
          "text": "Поиск доброго человека",
          "width": 160,
          "color": "#ffffff"
        },
        "returnGaps": [],
        "children": [
          {
            "id": "oHYUhpJ0hXsFOiWPa-sZo",
            "alias": "action",
            "block": {
              "text": "Найди дорого человека, который любит попугаев",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "mfYNRV047wNiar9Ptzd7I",
            "alias": "action",
            "block": {
              "text": "Отдай ему свою птицу",
              "width": 160,
              "color": "#ffffff"
            }
          },
          {
            "id": "EnCRsw77uVj2iKAquidS9",
            "alias": "if",
            "block": {
              "text": "Хочешь другого попугая?",
              "width": 160,
              "color": "#ffffff"
            },
            "trueOnRight": false,
            "gaps": [
              5
            ],
            "children": [
              {
                "alias": "system",
                "id": "gf0CFYEk9nCha_VNS4KHk",
                "block": {
                  "width": 0
                },
                "children": []
              },
              {
                "alias": "system",
                "id": "BbQw0KYTBLALBAZSc16Kq",
                "block": {
                  "width": 0
                },
                "children": [
                  {
                    "id": "B8bMfyl7OUwbDxGkpG5LA",
                    "alias": "action",
                    "block": {
                      "text": "С меня хватит! Замучался я с ним!",
                      "width": 160,
                      "color": "#ffffff"
                    }
                  }
                ],
                "out": {
                  "type": "return",
                  "level": 2,
                  "alias": "system",
                  "block": {
                    "text": "",
                    "width": 64,
                    "color": "#ffffff"
                  },
                  "id": "m58j0Kos6U5AIJO7C-e8P"
                }
              }
            ]
          }
        ],
        "returns": [
          {
            "text": "Покупка попугая",
            "width": 160,
            "color": "#ffffff"
          },
          {
            "text": "Завершение",
            "width": 160,
            "color": "#ffffff"
          }
        ]
      }
    ]
  }

  return iconDto;
}