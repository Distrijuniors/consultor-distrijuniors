exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Método no permitido" };

    try {
        const body = JSON.parse(event.body);
        // Recibimos el texto y le sacamos espacios extra de los costados
        const textoBuscado = body.textoBuscado.trim();

        const ODOO_URL = process.env.ODOO_URL;
        const ODOO_DB = process.env.ODOO_DB;
        const ODOO_USER = process.env.ODOO_USER;
        const ODOO_KEY = process.env.ODOO_KEY;

        // 1. Autenticación en Odoo
        const authResponse = await fetch(ODOO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "call",
                params: { service: "common", method: "authenticate", args: [ODOO_DB, ODOO_USER, ODOO_KEY, {}] }
            })
        });
        const authData = await authResponse.json();

        if (authData.error) return { statusCode: 200, body: JSON.stringify({ productos: [{ name: "URL O BASE DE DATOS INCORRECTA", list_price: 0, default_code: "¡ALTO!" }] }) };
        
        const uid = authData.result;
        if (!uid) return { statusCode: 200, body: JSON.stringify({ productos: [{ name: "CLAVE O USUARIO RECHAZADOS POR ODOO", list_price: 0, default_code: "¡ALTO!" }] }) };


        // --- 2. LÓGICA DE BÚSQUEDA INTELIGENTE (MÚLTIPLES PALABRAS) ---
        // Cortamos la frase en palabras sueltas usando los espacios
        const palabras = textoBuscado.split(/\s+/); 
        const nameConditions = [];
        
        // Odoo necesita un conector '&' (Y) por cada palabra extra que agreguemos
        for (let i = 0; i < palabras.length - 1; i++) {
            nameConditions.push('&');
        }
        
        // Le decimos que busque CADA palabra individualmente adentro del nombre
        palabras.forEach(palabra => {
            nameConditions.push(['name', 'ilike', palabra]);
        });

        // Armamos el filtro final mezclando el precio, el código y las palabras sueltas
        const dominioOdoo = [
            ['list_price', '>=', 60],
            '|', '|',
            ['barcode', '=', textoBuscado],
            ['default_code', 'ilike', textoBuscado],
            ...nameConditions
        ];
        // ----------------------------------------------------------------

        // 3. Ejecutar la búsqueda con el nuevo motor
        const searchResponse = await fetch(ODOO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "call",
                params: {
                    service: "object",
                    method: "execute_kw",
                    args: [
                        ODOO_DB, uid, ODOO_KEY,
                        "product.product",
                        "search_read",
                        [dominioOdoo],
                        {
                            "fields": ["name", "default_code", "barcode", "list_price", "image_512"],
                            "limit": 10
                        }
                    ]
                }
            })
        });
        const searchData = await searchResponse.json();

        if (searchData.error) {
            let mensajeError = searchData.error.data ? searchData.error.data.message : "Error interno de Odoo";
            return { statusCode: 200, body: JSON.stringify({ productos: [{ name: "ODOO SE QUEJA: " + mensajeError, list_price: 0, default_code: "ERROR TÉCNICO" }] }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ productos: searchData.result || [] })
        };

    } catch (error) {
        return { statusCode: 200, body: JSON.stringify({ productos: [{ name: "ERROR DEL CADETE: " + error.message, list_price: 0, default_code: "AVISO" }] }) };
    }
}
