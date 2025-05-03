import qrcode from "qrcode";
import invariant from "tiny-invariant";
import db from "../db.server";

export async function getQRCode(id, graphql) {
    const qrCode = await db.qrCode.findFirst({ where : { id } });

    if (!qrCode) return null;

    return supplementQRCode(qrCode, graphql);
}

// GET request for all QRCodes that a shop has
export async function getQRCodes(shop, graphql) {
    const qrCodes = await db.qrCode.findMany({
        where: { shop },
        orderBy: { id: "desc" }
    });

    if (qrCodes.length === 0) return [];

    return Promise.all(
        getQRCodes.map((qrCode) => supplementQRCode(qrCode, graphql))
    );
}

// GET Request for QRCode Image using id
// construct this URL, and then use the qrcode package to return a base 64-encoded QR code image
export function getQRCodeImage(id) {
    const url = new URL(`/qrcodes/${id}/scan`, process.env.SHOPIFY_APP_URL);
    return qrcode.toDataURL(url.href);
}

// Get URL for the QRCode
export function getDestinationUrl(qrCode) {
    if (qrCode.destination === "product") return `https://${qrCode.shop}/products/${qrCode.productHandle}`;

    const match = /gid:\/\/shopify\/ProductVariant\/([0-9]+)/.exec(qrCode.productVariantId);
    invariant(match, "Unrecognized product variant ID");

    return `https://${qrCode.shop}/cart/${match[1]}:1`;
}

/*
 Queries the GraphQL Admin API for the product title, and the first featured product image's URL and alt text. 
 It should also return an object with the QR code data and product data
*/
async function supplementQRCode(qrCode, graphql) {
    const qrCodeImagePromise = getQRCodeImage(qrCode.id)
    const response = await graphql(
        `
            query supplementQRCode($id: ID!) {
                product(id: $id) {
                    title
                    images(first: 1) {
                        nodes {
                            altText
                            url
                        }
                    }
                }
            }
        `,
        {
            variables: {
                id: qrCode.productId,
            },
        }
    );

    const { data: { product }, } = await response.json();

    return {
        ...qrCode,
        productDeleted: !product?.title,
        productTitle: product?.title,
        productImage: product?.images?.nodes[0]?.url,
        productAlt :product?.Images?.nodes[0]?.altText,
        desitnationUrl: getDestinationUrl(qrCode),
        image: await qrCodeImagePromise,
    };
}

// Checks whether the QRCode has a title, product and desination
export function validateQRCode(data) {
    const errors = {};

    if (!data.title) {
        errors.title = "Title id required";
    }

    if (!data.productId) {
        errors.productId = "Product id required";
    }

    if (!data.desination) {
        errors.desination = "Destination id required";
    }

    if (Object.keys(errors).length) {
        return errors;
    }
}
