# Entrada compatible al instalador conjunto del pool. No genera una fuente ZIP independiente.
import sys
from pool import main

if __name__ == '__main__':
    sys.exit(main(['--instalar', *sys.argv[1:]]))
