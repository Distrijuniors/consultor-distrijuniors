exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Método no permitido" };

    try {
        const body = JSON.parse(event.body);
        const textoBuscado = body.textoBuscado;

        const ODOO_URL = process.env.ODOO_URL;
        const ODOO_DB = process.env.ODOO_DB;
        const ODOO_USER = process.env.ODOO_USER;
        const ODOO_KEY = process.env.ODOO_KEY;

        // 1. Tocarle la puerta a Odoo (Autenticación)
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

        // Si Odoo rechaza el dominio
        if (authData.error) {
            return { statusCode: 200, body: JSON.stringify({ productos: [{ name: "URL O BASE DE DATOS INCORRECTA", list_price: 0, default_code: "¡ALTO!" }] }) };
        }

        const uid = authData.result;
        // Si Odoo rechaza la clave o el usuario
        if (!uid) {
            return { statusCode: 200, body: JSON.stringify({ productos: [{ name: "CLAVE O USUARIO RECHAZADOS POR ODOO", list_price: 0, default_code: "¡ALTO!" }] }) };
        }

        // 2. Buscar en el catálogo (CON EL FILTRO DE $60 ACTIVADO)
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
                        [
                            [
                                ['list_price', '>=', 60],
                                '|', '|',
                                ['name', 'ilike', textoBuscado],
                                ['default_code', 'ilike', textoBuscado],
                                ['barcode', '=', textoBuscado]
                            ]
                        ],
                        {
                            "fields": ["name", "default_code", "barcode", "list_price", "image_512"],
                            "limit": 10
                        }
                    ]
                }
            })
        });
        const searchData = await searchResponse.json();

        // Si la búsqueda tiene un error técnico
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
