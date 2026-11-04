// Datos neutros: no logotipos, nombres ni colores de marcas.
export const SHOP_CATEGORIES=[
  ['panaderia','Panadería','bakery,pastry,confectionery','', 'bread','#284c3b','#efdcb4'],
  ['carniceria','Carnicería','butcher,seafood,deli','', 'deli','#843e39','#f2ddd0'],
  ['fruteria','Frutería','greengrocer,farm','', 'fruit','#43643a','#e5d6a5'],
  ['supermercado','Supermercado','supermarket,convenience,food,organic','', 'shelves','#3d6570','#e8e0c9'],
  ['farmacia','Farmacia','chemist,medical_supply','pharmacy', 'boxes','#326f65','#e9f0de'],
  ['ropa','Ropa','clothes,fashion,boutique,tailor','', 'clothes','#414b59','#ede9e3'],
  ['calzado','Calzado','shoes,leather','', 'shoes','#775039','#e9dcc8'],
  ['libreria','Librería y papelería','books,stationery,newsagent,copyshop','', 'books','#6e4544','#efe2c6'],
  ['cafe','Café','coffee,tea','cafe,bar,pub,ice_cream,biergarten', 'cafe','#476456','#ead6b0'],
  ['restaurante','Restaurante','', 'restaurant,fast_food,food_court', 'restaurant','#874b36','#ecd9bb'],
  ['belleza','Peluquería','hairdresser,beauty,cosmetics,massage','', 'mirror','#6d5368','#eee1da'],
  ['electronica','Electrónica','electronics,mobile_phone,computer,hifi,electrical','', 'devices','#354a64','#e1e7eb'],
  ['bazar','Bazar y regalos','variety_store,gift,toys,houseware,department_store','', 'gifts','#92693b','#f0e0c0'],
  ['floristeria','Floristería','florist,garden_centre','', 'flowers','#536d46','#e5dfc3'],
  ['optica','Óptica','optician','', 'glasses','#375967','#dce8e5'],
  ['servicios','Servicios','travel_agency,dry_cleaning,laundry,ticket','bank,post_office,money_transfer', 'service','#4a5870','#e4dfd2'],
  ['generico','Comercio','','', 'shelves','#695542','#e9ddc6'],
].map(([id,label,shops,amenities,display,frame,paper])=>Object.freeze({id,label,shops:shops.split(',').filter(Boolean),amenities:amenities.split(',').filter(Boolean),display,frame,paper}));
export const SHOP_BY_ID=Object.fromEntries(SHOP_CATEGORIES.map(c=>[c.id,c]));
export function shopCategory(poi={}){return SHOP_CATEGORIES.find(c=>c.shops.includes(poi.shop)||c.amenities.includes(poi.amenity??poi.kind))??SHOP_BY_ID.generico;}
export function commercialTags(tags={}){return Object.fromEntries(Object.entries(tags).filter(([k])=>['shop','amenity','brand','brand:wikidata','cuisine','opening_hours','name','office','craft'].includes(k)||k.startsWith('addr:')));}
export function commercialRecord(id,x,z,tags={},extra={}){return {id,x,z,kind:tags.shop?'shop':tags.office?'office':tags.amenity??'shop',...commercialTags(tags),...extra};}
export function shopName(poi,category){return poi.brand||poi['brand:wikidata']?category.label:String(poi.name||category.label).replace(/[\u0000-\u001f]/g,'').slice(0,80);}
