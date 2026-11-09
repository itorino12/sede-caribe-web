"""Base vectorial (ChromaDB, en disco). Guarda un vector por fragmento, con el id del documento como metadato."""
import math


class Vectores:
    def __init__(self, carpeta, modelo):
        import chromadb
        from chromadb.config import Settings
        self.cliente = chromadb.PersistentClient(path=str(carpeta), settings=Settings(anonymized_telemetry=False))
        # una colección por modelo: si se cambia de modelo, los vectores viejos no se mezclan con los nuevos
        nombre = "fragmentos_" + "".join(c if c.isalnum() else "_" for c in modelo.split("/")[-1].lower())[:40]
        self.coleccion = self.cliente.get_or_create_collection(nombre, metadata={"hnsw:space": "cosine"},
                                                               embedding_function=None)

    def agregar(self, fids, vectores, doc_id):
        for i in range(0, len(fids), 500):
            self.coleccion.add(ids=fids[i:i + 500], embeddings=vectores[i:i + 500],
                               metadatas=[{"doc_id": doc_id}] * len(fids[i:i + 500]))

    def borrar(self, doc_id):
        self.coleccion.delete(where={"doc_id": doc_id})

    def buscar(self, vector, cuantos=20):
        """Devuelve [(fid, similitud)] con similitud coseno entre -1 y 1."""
        total = self.coleccion.count()
        if not total:
            return []
        r = self.coleccion.query(query_embeddings=[vector], n_results=min(cuantos, total), include=["distances"])
        return [(fid, 1.0 - d) for fid, d in zip(r["ids"][0], r["distances"][0])]

    def similitudes(self, vector, fids):
        """Similitud de la consulta con fragmentos concretos (los que solo halló la búsqueda por palabras)."""
        if not fids:
            return {}
        r = self.coleccion.get(ids=list(fids), include=["embeddings"])
        n = math.sqrt(sum(x * x for x in vector)) or 1.0
        salida = {}
        for fid, emb in zip(r["ids"], r["embeddings"]):
            m = math.sqrt(sum(float(x) * float(x) for x in emb)) or 1.0
            salida[fid] = sum(a * float(b) for a, b in zip(vector, emb)) / (n * m)
        return salida

    def contar(self):
        return self.coleccion.count()
