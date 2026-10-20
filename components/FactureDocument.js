"use client";
import { dateFr, euros } from "@/lib/facturation";

/**
 * Facture au format A4, sur le modèle de la facture FA2610-0002.
 * facture = { numero, date_facture, date_echeance, modele, periode_du, periode_au, client: {...}, config, lignes, totaux }
 * modele « simple » : une ligne par fiche ; « detaillee » : chaque ligne suivie de la liste des dossiers.
 */
export default function FactureDocument({ facture }) {
  const { config: c, client: cl, lignes, totaux: t } = facture;
  const detaillee = facture.modele === "detaillee";
  const tva = Number(c.tva) || 0;
  const vide = lignes.length === 0;

  return (
    <article className="facture-a4" aria-label={`Facture ${facture.numero}`}>
      <div className="flex justify-between items-start gap-6">
        <p className="fa-marque">{c.emetteur.nom}</p>
        <div className="text-right">
          <p className="fa-titre">Facture {facture.numero}</p>
          <p className="fa-petit mt-3">Date facturation : {dateFr(facture.date_facture)}</p>
          <p className="fa-petit">Date échéance : {dateFr(facture.date_echeance)}</p>
          {cl.code_client && <p className="fa-petit">Code client : {cl.code_client}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mt-8">
        <div>
          <p className="fa-petit mb-1.5">Émetteur</p>
          <div className="fa-cadre fa-cadre-gris">
            <p className="fa-nom">{c.emetteur.nom}</p>
            <p>{c.emetteur.adresse}</p>
            <p>{c.emetteur.cp_ville}</p>
            <p className="mt-2">Tél.: {c.emetteur.tel}</p>
            <p>Email: {c.emetteur.email}</p>
            <p>Web: {c.emetteur.web}</p>
          </div>
        </div>
        <div>
          <p className="fa-petit mb-1.5">Adressé à</p>
          <div className="fa-cadre">
            <p className="fa-nom">{cl.raison_sociale || facture.clientNom}</p>
            {cl.adresse && <p>{cl.adresse}</p>}
            {cl.cp_ville && <p>{cl.cp_ville}</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-between fa-petit mt-6">
        <span>Catégorie d'opérations : {c.categorie}</span>
        <span>Montants exprimés en Euros</span>
      </div>
      {detaillee && (
        <p className="fa-petit mt-1">
          Période : du {dateFr(facture.periode_du)} au {dateFr(facture.periode_au)} · {lignes.reduce((s, l) => s + l.qte, 0)} dossier(s)
        </p>
      )}

      <table className="fa-table mt-2">
        <thead>
          <tr>
            <th className="text-left">Désignation</th>
            <th className="text-left w-[52px]">TVA</th>
            <th className="text-right w-[70px]">P.U. HT</th>
            <th className="text-right w-[52px]">Qté</th>
            <th className="text-right w-[84px]">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <LigneFacture key={`${l.fiche}|${l.nature}`} l={l} detaillee={detaillee} />
          ))}
          {vide && (
            <tr>
              <td colSpan={5} className="text-center py-6 text-[#8A96A3]">
                Aucun dossier à facturer sur cette période.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="fa-bas">
        <div className="grid grid-cols-[1fr_200px] gap-8 pt-3">
          <div>
            <p>
              <b>Conditions de règlement:</b>&nbsp; {c.conditions}
            </p>
            <div className="fa-banque mt-3">
              <p>Bénéficiaire: {c.banque.beneficiaire}</p>
              <p>
                IBAN: {c.banque.iban} BIC: {c.banque.bic}
              </p>
              <p>
                ADRESSE: {c.banque.adresse} BANQUE: {c.banque.banque}
              </p>
            </div>
          </div>
          <div className="fa-totaux">
            <p>
              <span>Total HT</span>
              <span>{euros(t.ht)}</span>
            </p>
            <p>
              <span>Total TVA {String(tva).replace(".", ",")}%</span>
              <span>{euros(t.tva)}</span>
            </p>
            <p className="fa-ttc">
              <span>Total TTC</span>
              <span>{euros(t.ttc)}</span>
            </p>
          </div>
        </div>
        <div className="fa-pied">
          <p>
            {c.pied.forme} - Capital de {c.pied.capital} - SIRET: {c.pied.siret}
          </p>
          <p>Numéro TVA: {c.pied.tva_intra}</p>
        </div>
      </div>
    </article>
  );
}

function LigneFacture({ l, detaillee }) {
  const ligne = (
    <tr className={detaillee ? "fa-groupe" : ""}>
      <td>{l.designation}</td>
      <td>{String(l.tva).replace(".", ",")}%</td>
      <td className="text-right">{euros(l.pu)}</td>
      <td className="text-right">{l.qte}</td>
      <td className="text-right">{euros(l.total)}</td>
    </tr>
  );
  if (!detaillee) return ligne;
  return (
    <>
      {ligne}
      {l.dossiers.map((d) => (
        <tr key={d.id} className="fa-detail">
          <td>
            <span className="fa-dossier">{d.nom}</span>
            {d.date && <span className="fa-date">{dateFr(d.date)}</span>}
          </td>
          <td />
          <td className="text-right">{euros(l.pu)}</td>
          <td className="text-right">1</td>
          <td className="text-right">{euros(l.pu)}</td>
        </tr>
      ))}
      <tr className="fa-sous-total">
        <td colSpan={3}>Sous-total {l.fiche}{l.nature === "Modification" ? " (modifications)" : ""}</td>
        <td className="text-right">{l.qte}</td>
        <td className="text-right">{euros(l.total)}</td>
      </tr>
    </>
  );
}
